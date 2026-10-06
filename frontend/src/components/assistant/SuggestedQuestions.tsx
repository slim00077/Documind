import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getDocumentRequest, listDocumentsRequest } from "../../services/documents.api";

const FOLLOW_UPS = [
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
          `Summarize ${scopedName} in 5 bullet points`,
          "What are the key dates and deadlines?",
          "Which people or organizations are mentioned?",
          ...topics.map((topic) => `What does the document say about ${topic}?`),
        ];
      }

      const documents = (await listDocumentsRequest(token)).filter((document) => READY.has(document.status));
      if (documents.length === 0) return [];

      return [
        ...documents.slice(0, 2).map((document) => `Summarize "${document.name}"`),
        "What are the main topics across my documents?",
        "Which of my documents mention dates or deadlines?",
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
  }, [token, mode, scopedId, scopedName]);

  const items = mode === "followup" ? FOLLOW_UPS : questions;
  if (items.length === 0) return null;

  return (
    <div className={`suggested-questions ${mode === "followup" ? "is-followup" : ""}`} aria-label="Suggested questions">
      {items.map((question) => (
        <button key={question} type="button" className="suggestion-chip" disabled={disabled} onClick={() => onPick(question)}>
          <Sparkles /> {question}
        </button>
      ))}
    </div>
  );
}
