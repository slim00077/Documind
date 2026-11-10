import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { getDocumentRequest, listDocumentsRequest } from "../../services/documents.api";
import type { TranslationKey } from "../../i18n";

// Suggestions are sent to the assistant as typed, so they follow the UI language; document names
// and AI-generated topics are inserted unchanged.
const FOLLOW_UPS: TranslationKey[] = [
  "Summarize that in 3 bullet points",
  "Give me more detail",
  "What are the key takeaways?",
];

type SuggestedQuestionsProps = {
  /** "start" shows document-aware starters; "followup" shows generic follow-ups. */
  mode: "start" | "followup";
  scopedDocument?: { id: number; name: string } | null;
  disabled?: boolean;
  onPick: (question: string) => void;
};

const READY = new Set(["READY", "COMPLETED"]);

/**
 * Clickable question suggestions built from the user's real documents (and,
 * when a document is in scope, its AI-generated topics) - nothing hard-coded
 * about content the user doesn't actually have.
 */
export default function SuggestedQuestions({ mode, scopedDocument, disabled, onPick }: SuggestedQuestionsProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [questions, setQuestions] = useState<string[]>([]);
  const scopedId = scopedDocument?.id ?? null;
  const scopedName = scopedDocument?.name ?? "";

  useEffect(() => {
    if (!token || mode !== "start") return;
    let isActive = true;

    const build = async (): Promise<string[]> => {
      if (scopedId !== null) {
        const document = await getDocumentRequest(token, scopedId);
        const topics = document.insights?.topics.slice(0, 2) ?? [];
        return [
          t("Summarize {{name}} in 5 bullet points", { name: scopedName }),
          t("What are the key dates and deadlines?"),
          t("Which people or organizations are mentioned?"),
          ...topics.map((topic) => t("What does the document say about {{topic}}?", { topic })),
        ];
      }

      const documents = (await listDocumentsRequest(token)).filter((document) => READY.has(document.status));
      if (documents.length === 0) return [];

      return [
        ...documents.slice(0, 2).map((document) => t("Summarize \"{{name}}\"", { name: document.name })),
        t("What are the main topics across my documents?"),
        t("Which of my documents mention dates or deadlines?"),
      ];
    };

    build()
      .then((result) => {
        if (isActive) setQuestions(result);
      })
      .catch(() => {
        if (isActive) setQuestions([]);
      });

    return () => {
      isActive = false;
    };
  }, [token, mode, scopedId, scopedName, t]);

  const items = mode === "followup" ? FOLLOW_UPS.map((key) => t(key)) : questions;
  if (items.length === 0) return null;

  return (
    <div className={`suggested-questions ${mode === "followup" ? "is-followup" : ""}`} aria-label={t("Suggested questions")}>
      {items.map((question) => (
        <button key={question} type="button" className="suggestion-chip" disabled={disabled} onClick={() => onPick(question)}>
          <Sparkles /> {question}
        </button>
      ))}
    </div>
  );
}
