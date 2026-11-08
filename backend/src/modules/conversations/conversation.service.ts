import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AssistantService, type AssistantSource } from "../assistant/assistant.service";
import { MessageRole } from "../../../generated/prisma/client";
import type { ConversationTurn } from "../llm/llm-provider";
import { anyAccessWhere } from "../access/document-access";

export type ConversationStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "done";
      message: {
        id: number;
        role: "assistant";
        content: string;
        sources: AssistantSource[];
        createdAt: Date;
      };
    };

const TITLE_MAX_LENGTH = 60;
const HISTORY_TURN_LIMIT = 10;
// Token guard for long chats: each turn is clipped and the whole history is
// capped, keeping the newest turns (~4 chars per token).
const HISTORY_TURN_MAX_CHARS = 1200;
const HISTORY_TOTAL_MAX_CHARS = 6000;

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assistantService: AssistantService,
  ) {}

  async create(userId: number, documentId?: number) {
    if (documentId !== undefined) {
      const document = await this.prisma.document.findFirst({
        where: {
          id: documentId,
          deletedAt: null,
          ...anyAccessWhere(userId),
        },
        select: { id: true, name: true },
      });

      if (!document) {
        throw new NotFoundException("Document not found");
      }

      return this.prisma.conversation.create({
        data: {
          userId,
          scopedDocumentId: document.id,
          title: `Ask AI: ${document.name}`.slice(0, TITLE_MAX_LENGTH),
        },
      });
    }

    return this.prisma.conversation.create({
      data: { userId },
    });
  }

  async findAll(userId: number) {
    const conversations = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
    });

    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastMessage: conversation.messages[0] ?? null,
    }));
  }

  async findOne(userId: number, id: number) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const scopedDocument = conversation.scopedDocumentId
      ? await this.prisma.document.findFirst({
          where: { id: conversation.scopedDocumentId, deletedAt: null, ...anyAccessWhere(userId) },
          select: { id: true, name: true },
        })
      : null;

    return { ...conversation, scopedDocument };
  }

  async remove(userId: number, id: number) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    await this.prisma.conversation.delete({ where: { id } });

    return { id };
  }

  private async loadForSend(userId: number, id: number, content: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: HISTORY_TURN_LIMIT,
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    // messages are newest-first; keep the newest ones that fit the budget.
    const history: ConversationTurn[] = [];
    let budget = HISTORY_TOTAL_MAX_CHARS;
    for (const message of conversation.messages) {
      const text = message.content.trim();
      if (!text) continue;
      const content =
        text.length > HISTORY_TURN_MAX_CHARS ? `${text.slice(0, HISTORY_TURN_MAX_CHARS)}…` : text;
      if (content.length > budget) break;
      budget -= content.length;
      history.unshift({
        role: message.role === MessageRole.USER ? "user" : "assistant",
        content,
      });
    }

    await this.prisma.message.create({
      data: {
        conversationId: id,
        role: MessageRole.USER,
        content,
      },
    });

    return { conversation, history };
  }

  async sendMessage(userId: number, id: number, content: string) {
    const { conversation, history } = await this.loadForSend(userId, id, content);

    const result = await this.assistantService.ask(
      userId,
      content,
      history,
      conversation.lastDocumentId,
      conversation.scopedDocumentId,
    );

    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId: id,
        role: MessageRole.ASSISTANT,
        content: result.answer,
        sources: result.sources as unknown as object,
      },
    });

    const isFirstMessage = conversation.messages.length === 0;

    await this.prisma.conversation.update({
      where: { id },
      data: {
        updatedAt: new Date(),
        lastDocumentId: result.matchedDocumentId ?? conversation.lastDocumentId,
        ...(isFirstMessage && !conversation.scopedDocumentId ? { title: this.generateTitle(content) } : {}),
      },
    });

    return {
      id: assistantMessage.id,
      role: "assistant" as const,
      content: assistantMessage.content,
      sources: result.sources as AssistantSource[],
      createdAt: assistantMessage.createdAt,
    };
  }

  /**
   * Streaming variant of sendMessage: yields text deltas, then a final "done"
   * event carrying the persisted assistant message. If the caller cancels
   * mid-answer, whatever text was generated so far is saved so the stored
   * history matches what the user saw.
   */
  async *streamMessage(
    userId: number,
    id: number,
    content: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ConversationStreamEvent> {
    const { conversation, history } = await this.loadForSend(userId, id, content);
    let partial = "";

    try {
      for await (const event of this.assistantService.askStream(
        userId,
        content,
        history,
        conversation.lastDocumentId,
        conversation.scopedDocumentId,
        signal,
      )) {
        if (event.type === "delta") {
          partial += event.text;
          yield event;
          continue;
        }

        const message = await this.saveAssistantMessage(
          conversation,
          event.result.answer,
          event.result.sources,
          event.result.matchedDocumentId,
          content,
        );
        yield { type: "done", message };
      }
    } catch (error) {
      if (signal?.aborted && partial) {
        await this.saveAssistantMessage(conversation, partial, [], null, content);
      }
      throw error;
    }
  }

  private async saveAssistantMessage(
    conversation: { id: number; lastDocumentId: number | null; scopedDocumentId: number | null; messages: unknown[] },
    answer: string,
    sources: AssistantSource[],
    matchedDocumentId: number | null,
    userContent: string,
  ) {
    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: answer,
        sources: sources as unknown as object,
      },
    });

    const isFirstMessage = conversation.messages.length === 0;

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        updatedAt: new Date(),
        lastDocumentId: matchedDocumentId ?? conversation.lastDocumentId,
        ...(isFirstMessage && !conversation.scopedDocumentId
          ? { title: this.generateTitle(userContent) }
          : {}),
      },
    });

    return {
      id: assistantMessage.id,
      role: "assistant" as const,
      content: assistantMessage.content,
      sources,
      createdAt: assistantMessage.createdAt,
    };
  }

  private generateTitle(firstMessage: string): string {
    const cleaned = firstMessage.replace(/\s+/g, " ").trim();

    if (cleaned.length <= TITLE_MAX_LENGTH) {
      return cleaned;
    }

    return `${cleaned.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
  }
}
