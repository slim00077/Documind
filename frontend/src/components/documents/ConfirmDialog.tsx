import { useTranslation } from "react-i18next";

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  isBusy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  isBusy = false,
  error = "",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p className="modal-message">{message}</p>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onCancel}
            disabled={isBusy}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="button button-danger"
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy ? t("Deleting...") : confirmLabel ?? t("Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
