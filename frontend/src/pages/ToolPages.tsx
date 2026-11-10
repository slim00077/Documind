import { useEffect, useState } from "react";
import { BookOpen, FileText, GraduationCap, Lightbulb, Scale, ScanText, Search, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { listDocumentsRequest } from "../services/documents.api";
import type { Document } from "../types/document";
import SemanticSearchPanel from "../components/documents/SemanticSearchPanel";
import CompareDocumentsPanel from "../components/documents/CompareDocumentsPanel";
import DocumentIntelligencePanel from "../components/documents/DocumentIntelligencePanel";
import FeatureCard from "../components/ui/FeatureCard";
import { PageState } from "../components/ui/PageState";

function PageHeading({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <div className="page-heading">
      <div>
        <p className="section-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}

export function SearchPage() {
  const { t } = useTranslation();
  return (
    <section className="page-stack">
      <PageHeading kicker={t("Search")} title={t("Search your documents")} text={t("Hybrid keyword and semantic search across every document you can access.")} />
      <SemanticSearchPanel />
    </section>
  );
}

export function ComparePage() {
  const { t } = useTranslation();
  return (
    <section className="page-stack">
      <PageHeading kicker={t("Comparison")} title={t("Compare documents")} text={t("Pick two documents to see what they share and where they differ.")} />
      <CompareDocumentsPanel />
    </section>
  );
}

export function StudyToolsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    listDocumentsRequest(token)
      .then((docs) => {
        const ready = docs.filter((doc) => doc.status === "READY" || doc.status === "COMPLETED");
        setDocuments(ready);
        setSelected((current) => current ?? ready[0]?.id ?? null);
      })
      .catch(() => setDocuments([]));
  }, [token]);

  return (
    <section className="page-stack">
      <PageHeading
        kicker={t("Study tools")}
        title={t("Study with your documents")}
        text={t("Summaries, key information and study questions with answers, generated from the document you pick.")}
      />
      {documents === null ? null : documents.length === 0 ? (
        <PageState
          icon={BookOpen}
          title={t("No processed documents yet")}
          message={t("Upload a document and wait for processing to finish to unlock study tools.")}
        />
      ) : (
        <>
          <label className="auth-label" htmlFor="study-doc" style={{ margin: 0 }}>
            {t("Document")}
          </label>
          <select id="study-doc" className="auth-input filter-select" style={{ maxWidth: 420, width: "100%" }} value={selected ?? ""} onChange={(e) => setSelected(Number(e.target.value))}>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.name}
              </option>
            ))}
          </select>
          {selected ? (
            <article className="workspace-panel">
              <DocumentIntelligencePanel key={selected} documentId={selected} isReady />
            </article>
          ) : null}
        </>
      )}
    </section>
  );
}

export function AiToolsPage() {
  const { t } = useTranslation();
  return (
    <section className="page-stack">
      <PageHeading kicker={t("AI tools")} title={t("AI tools")} text={t("Everything DocuMind can do with your documents, in one place.")} />
      <div className="feature-grid">
        <FeatureCard icon={Scale} title={t("Document comparison")} text={t("Similarities, differences and contradictions between documents.")} to="/app/compare" action={t("Compare")} />
        <FeatureCard icon={Lightbulb} title={t("Collection insights")} text={t("Recurring themes and related documents across your library.")} to="/app/insights" action={t("Analyze")} />
        <FeatureCard icon={Search} title={t("Semantic search")} text={t("Find passages by meaning with citations.")} to="/app/search" action={t("Search")} />
        <FeatureCard icon={ScanText} title={t("Summaries & extraction")} text={t("Open any document to summarize it and extract key information.")} to="/app/documents" action={t("Choose a document")} />
        <FeatureCard icon={GraduationCap} title={t("Study questions")} text={t("Generate questions and answers for classroom or revision.")} to="/app/study" action={t("Generate")} />
        <FeatureCard icon={Sparkles} title={t("AI assistant")} text={t("Ask questions across your authorized documents.")} to="/app/assistant" action={t("Ask")} />
        <FeatureCard icon={FileText} title={t("Document library")} text={t("Upload and organize the documents these tools run on.")} to="/app/documents" action={t("Open library")} />
      </div>
    </section>
  );
}
