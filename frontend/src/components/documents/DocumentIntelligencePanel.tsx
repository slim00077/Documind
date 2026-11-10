import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpenCheck, ListChecks, Loader2, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/documents.api";
import { extractionRequest, questionsRequest, summarizeRequest } from "../../services/intelligence.api";
import type { Coverage, ExtractionResult, QuestionsResult, SummaryLevel, SummaryResult } from "../../types/intelligence";
import type { TranslationKey } from "../../i18n";

type Tab = "summary" | "extraction" | "questions";
const TABS: { id: Tab; label: TranslationKey; icon: typeof ScrollText }[] = [
  { id: "summary", label: "Summaries", icon: ScrollText },
  { id: "extraction", label: "Key information", icon: ListChecks },
  { id: "questions", label: "Study questions", icon: BookOpenCheck },
];

/** Labels for the fixed enum values the analysis API returns (the analysed text itself is never translated). */
const ENTITY_TYPE: Record<string, TranslationKey> = {
  person: "person",
  organization: "organization",
  place: "place",
  product: "product",
  other: "other",
};
const QUESTION_TYPE: Record<string, TranslationKey> = {
  factual: "factual",
  conceptual: "conceptual",
  application: "application",
};

const Footnote = ({ coverage, cached }: { coverage: Coverage; cached: boolean }) => {
  const { t } = useTranslation();
  return (
    <p className="ai-muted">
      {t("AI-generated from {{used}} of {{count}} passages", { used: coverage.passagesUsed, count: coverage.totalPassages })}
      {cached ? ` · ${t("saved result")}` : ""}. {t("Verify important details in the original document.")}
    </p>
  );
};

const Chips = ({ title, items }: { title: string; items: string[] }) =>
  items.length ? (
    <div className="insight-group">
      <h4>{title}</h4>
      <ul className="insight-chips">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  ) : null;

export default function DocumentIntelligencePanel({ documentId, isReady }: { documentId: number; isReady: boolean }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("summary");
  const [level, setLevel] = useState<SummaryLevel>("short");
  const [mode, setMode] = useState<"study" | "review">("study");
  const [count, setCount] = useState(8);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [questions, setQuestions] = useState<QuestionsResult | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isReady) return null;

  const generate = async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      if (tab === "summary") setSummary(await summarizeRequest(token, documentId, level));
      if (tab === "extraction") setExtraction(await extractionRequest(token, documentId));
      if (tab === "questions") {
        setRevealed(new Set());
        setQuestions(await questionsRequest(token, documentId, count, mode));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const passageLink = (n: number | null) =>
    n === null ? null : (
      <Link to={`?chunk=${n}`} className="citation-chip" title={t("Show passage")}>
        {n + 1}
      </Link>
    );

  return (
    <section className="ai-panel" aria-label={t("AI document intelligence")}>
      <div className="ai-toolbar" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            type="button"
            className={`button ${tab === id ? "button-primary" : ""}`}
            onClick={() => {
              setTab(id);
              setError("");
            }}
          >
            <Icon /> {t(label)}
          </button>
        ))}
      </div>

      <div className="ai-toolbar">
        {tab === "summary" ? (
          <select aria-label={t("Summary length")} value={level} onChange={(e) => setLevel(e.target.value as SummaryLevel)}>
            <option value="short">{t("Short summary")}</option>
            <option value="detailed">{t("Detailed summary")}</option>
            <option value="sections">{t("Section by section")}</option>
          </select>
        ) : null}
        {tab === "questions" ? (
          <>
            <select aria-label={t("Question type")} value={mode} onChange={(e) => setMode(e.target.value as "study" | "review")}>
              <option value="study">{t("Study (understanding)")}</option>
              <option value="review">{t("Review (recall)")}</option>
            </select>
            <select aria-label={t("Number of questions")} value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[4, 8, 12, 16].map((n) => (
                <option key={n} value={n}>
                  {t("{{count}} questions", { count: n })}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <button type="button" className="button button-primary" disabled={busy} onClick={() => void generate()}>
          {busy ? (
            <>
              <Loader2 className="spin" /> {t("Working…")}
            </>
          ) : (
            t("Generate")
          )}
        </button>
      </div>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "summary" && !summary && !busy && !error ? (
        <p className="ai-muted">{t("Choose a length and generate a summary grounded in this document.")}</p>
      ) : null}
      {tab === "summary" && summary ? (
        <div className="ai-card">
          {summary.sections ? (
            summary.sections.map((s) => (
              <div key={`${s.title}-${s.fromPassage}`} style={{ marginBottom: 12 }}>
                <h4>
                  {s.title}{" "}
                  {s.fromPassage !== null ? (
                    <span className="ai-muted">
                      {t("passages {{from}}–{{to}}", { from: s.fromPassage + 1, to: (s.toPassage ?? s.fromPassage) + 1 })} {passageLink(s.fromPassage)}
                    </span>
                  ) : null}
                </h4>
                <p>{s.summary}</p>
              </div>
            ))
          ) : (
            <p style={{ whiteSpace: "pre-wrap" }}>{summary.summary}</p>
          )}
          <Footnote coverage={summary.coverage} cached={summary.cached} />
        </div>
      ) : null}

      {tab === "extraction" && !extraction && !busy && !error ? (
        <p className="ai-muted">
          {t("Extract key points, names, dates, numbers and topics. Names, dates and numbers are checked against the document text.")}
        </p>
      ) : null}
      {tab === "extraction" && extraction ? (
        <div className="ai-card">
          <h4>{t("Key points")}</h4>
          <ul>
            {extraction.keyPoints.map((k, i) => (
              <li key={i}>
                {k.text} {passageLink(k.passage)}
              </li>
            ))}
          </ul>
          <Chips
            title={t("People, organizations & places")}
            items={extraction.entities.map((e) => `${e.name} (${ENTITY_TYPE[e.type] ? t(ENTITY_TYPE[e.type]) : e.type})`)}
          />
          <Chips
            title={t("Dates & deadlines")}
            items={extraction.dates.map((d) => `${d.date}${d.isDeadline ? ` (${t("deadline")})` : ""} - ${d.context}`)}
          />
          <Chips title={t("Numbers & facts")} items={extraction.numbers.map((n) => `${n.value} - ${n.label}`)} />
          <Chips title={t("Keywords")} items={extraction.keywords} />
          <Chips title={t("Topics (AI-derived)")} items={extraction.topics} />
          {extraction.verification.discardedUnverifiedItems > 0 ? (
            <p className="ai-muted">
              {t("{{count}} items were removed because they could not be found verbatim in the document.", { count: extraction.verification.discardedUnverifiedItems })}
            </p>
          ) : null}
          <Footnote coverage={extraction.coverage} cached={extraction.cached} />
        </div>
      ) : null}

      {tab === "questions" && !questions && !busy && !error ? (
        <p className="ai-muted">{t("Generate questions and answers; each answer cites a quote from the document.")}</p>
      ) : null}
      {tab === "questions" && questions ? (
        <div className="ai-card">
          <ol style={{ display: "grid", gap: 12, paddingLeft: 20, margin: 0 }}>
            {questions.questions.map((q, i) => (
              <li key={i}>
                <strong>{q.question}</strong> <span className="ai-badge">{QUESTION_TYPE[q.type] ? t(QUESTION_TYPE[q.type]) : q.type}</span>
                {revealed.has(i) ? (
                  <>
                    <p>{q.answer}</p>
                    <p className="source-excerpt">
                      “{q.evidence}” {passageLink(q.passage)}
                    </p>
                  </>
                ) : (
                  <div>
                    <button type="button" className="button" onClick={() => setRevealed((prev) => new Set(prev).add(i))}>
                      {t("Show answer")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {questions.verification.rejectedWithoutEvidence > 0 ? (
            <p className="ai-muted">
              {t("{{count}} generated questions were dropped because their evidence quote could not be verified.", { count: questions.verification.rejectedWithoutEvidence })}
            </p>
          ) : null}
          <Footnote coverage={questions.coverage} cached={questions.cached} />
        </div>
      ) : null}
    </section>
  );
}
