import { useTranslation } from "react-i18next";
import type { DocumentStatus } from "../../types/document";
import { DOCUMENT_STATUS_LABEL as statusLabels } from "../../config/documents";

export default function StatusBadge({ status }: { status: DocumentStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      {t(statusLabels[status])}
    </span>
  );
}
