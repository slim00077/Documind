"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const assistant_service_1 = require("../assistant/assistant.service");
const client_1 = require("../../../generated/prisma/client");
const TITLE_MAX_LENGTH = 60;
const HISTORY_TURN_LIMIT = 10;
let ConversationService = class ConversationService {
    prisma;
    assistantService;
    constructor(prisma, assistantService) {
        this.prisma = prisma;
        this.assistantService = assistantService;
    }
    async create(userId) {
        return this.prisma.conversation.create({
            data: { userId },
        });
    }
    async findAll(userId) {
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
    async findOne(userId, id) {
        const conversation = await this.prisma.conversation.findFirst({
            where: { id, userId },
            include: {
                messages: {
                    orderBy: { createdAt: "asc" },
                },
            },
        });
        if (!conversation) {
            throw new common_1.NotFoundException("Conversation not found");
        }
        return conversation;
    }
    async remove(userId, id) {
        const conversation = await this.prisma.conversation.findFirst({
            where: { id, userId },
            select: { id: true },
        });
        if (!conversation) {
            throw new common_1.NotFoundException("Conversation not found");
        }
        await this.prisma.conversation.delete({ where: { id } });
        return { id };
    }
    async sendMessage(userId, id, content) {
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
            throw new common_1.NotFoundException("Conversation not found");
        }
        const history = conversation.messages
            .slice()
            .reverse()
            .map((message) => ({
            role: message.role === client_1.MessageRole.USER ? "user" : "assistant",
            content: message.content,
        }));
        await this.prisma.message.create({
            data: {
                conversationId: id,
                role: client_1.MessageRole.USER,
                content,
            },
        });
        const result = await this.assistantService.ask(userId, content, history, conversation.lastDocumentId);
        const assistantMessage = await this.prisma.message.create({
            data: {
                conversationId: id,
                role: client_1.MessageRole.ASSISTANT,
                content: result.answer,
                sources: result.sources,
            },
        });
        const isFirstMessage = conversation.messages.length === 0;
        await this.prisma.conversation.update({
            where: { id },
            data: {
                updatedAt: new Date(),
                lastDocumentId: result.matchedDocumentId ?? conversation.lastDocumentId,
                ...(isFirstMessage ? { title: this.generateTitle(content) } : {}),
            },
        });
        return {
            id: assistantMessage.id,
            role: "assistant",
            content: assistantMessage.content,
            sources: result.sources,
            createdAt: assistantMessage.createdAt,
        };
    }
    generateTitle(firstMessage) {
        const cleaned = firstMessage.replace(/\s+/g, " ").trim();
        if (cleaned.length <= TITLE_MAX_LENGTH) {
            return cleaned;
        }
        return `${cleaned.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
    }
};
exports.ConversationService = ConversationService;
exports.ConversationService = ConversationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        assistant_service_1.AssistantService])
], ConversationService);
