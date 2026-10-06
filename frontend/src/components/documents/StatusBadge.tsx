import type { DocumentStatus } from "../../types/document";

const statusLabels: Record<DocumentStatus, string> = {
  PENDING: "Pending",
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  READY: "Ready",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export default function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      {statusLabels[status]}
    </span>
  );
}
