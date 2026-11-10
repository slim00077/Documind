import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DocumentStatus } from "../../types/document";
import type { TranslationKey } from "../../i18n";

const STEPS: TranslationKey[] = ["Uploaded", "Extracted", "Chunked", "Embedded", "AI Ready"];

type ProcessingStepsProps = {
  status: DocumentStatus;
  hasExtractedText?: boolean;
  chunkCount?: number;
  /** Exact count from the chunks endpoint; when omitted, embedding is inferred from status. */
  embeddedCount?: number;
};

/**
 * Pipeline: Uploaded -> Extracted -> Chunked -> Embedded -> AI Ready, derived
 * from the document's real state (extracted text, stored chunks, embedded
 * chunks, status) rather than a fixed status-to-step mapping.
 */
export default function ProcessingSteps({
  status,
  hasExtractedText = false,
  chunkCount = 0,
  embeddedCount,
}: ProcessingStepsProps) {
  const { t } = useTranslation();
  const isReady = status === "READY" || status === "COMPLETED";
  const isFailed = status === "FAILED";

  const done = [
    true,
    isReady || hasExtractedText || chunkCount > 0,
    isReady || chunkCount > 0,
    isReady ||
      (embeddedCount !== undefined && chunkCount > 0 && embeddedCount >= chunkCount),
    isReady,
  ];

  // The first stage that isn't done is the one currently running (or the one that failed).
  const currentIndex = done.findIndex((value) => !value);

  return (
    <ol className="processing-steps" aria-label={t("Processing pipeline")}>
      {STEPS.map((label, index) => {
        let stateClass = "";
        let icon = null;

        if (done[index]) {
          stateClass = "processing-step-done";
          icon = <Check />;
        } else if (index === currentIndex) {
          if (isFailed) {
            stateClass = "processing-step-failed";
            icon = <X />;
          } else if (status !== "PENDING" && status !== "UPLOADED") {
            stateClass = "processing-step-active";
          }
        }

        return (
          <li key={label} className={`processing-step ${stateClass}`}>
            <span className="processing-step-dot">{icon}</span>
            <span className="processing-step-label">{t(label)}</span>
          </li>
        );
      })}
    </ol>
  );
}
