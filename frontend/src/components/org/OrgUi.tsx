import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrgApiError } from "../../services/organizations.api";
import i18n, { type TranslationKey } from "../../i18n";
import { formatDate as formatLocaleDate } from "../../i18n/format";

/** Loads data with loading/error state and a manual reload. `load` must be stable (useCallback) or keyed by `deps`. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const counter = useRef(0);

  const reload = useCallback(async () => {
    const run = ++counter.current;
    setIsLoading(true);
    setError("");
    try {
      const result = await load();
      if (run === counter.current) setData(result);
    } catch (e) {
      if (run === counter.current) setError(messageOf(e, i18n.t("Unable to load this right now.")));
    } finally {
      if (run === counter.current) setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, isLoading, reload, setData };
}

export const messageOf = (error: unknown, fallback: string) => (error instanceof OrgApiError || error instanceof Error ? error.message : fallback);

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 560 } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="page-heading" style={{ marginBottom: 6 }}>
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t("Close")}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A modal wrapping a form: handles the busy/error state of an async submit. */
export function FormModal({
  title, submitLabel, onClose, onSubmit, children, wide,
}: { title: string; submitLabel: string; onClose: () => void; onSubmit: () => Promise<void>; children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit();
    } catch (e) {
      setError(messageOf(e, t("Something went wrong.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} wide={wide}>
      <form onSubmit={submit} className="org-form">
        {children}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <div className="form-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>{t("Cancel")}</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? t("Working...") : submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="org-field">
      <span className="auth-label">{label}</span>
      {children}
      {hint ? <small className="meta">{hint}</small> : null}
    </label>
  );
}

export type Tone = "success" | "warn" | "danger" | "muted" | "accent";
const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success", APPROVED: "success", ACCEPTED: "success", READY: "success",
  PENDING: "warn", SUSPENDED: "warn", EXPIRED: "muted",
  REJECTED: "danger", REMOVED: "danger", REVOKED: "danger", FAILED: "danger",
  CANCELLED: "muted", ARCHIVED: "muted", LEFT: "muted",
  ADMIN: "accent", TEACHER: "accent", STUDENT: "muted", LEAD_TEACHER: "accent", CO_TEACHER: "muted",
};
const LABEL: Record<string, TranslationKey> = {
  ACTIVE: "Active", APPROVED: "Approved", ACCEPTED: "Accepted", READY: "Ready",
  PENDING: "Pending", SUSPENDED: "Suspended", EXPIRED: "Expired",
  REJECTED: "Rejected", REMOVED: "Removed", REVOKED: "Revoked", FAILED: "Failed",
  CANCELLED: "Cancelled", ARCHIVED: "Archived", LEFT: "Left",
  ADMIN: "Admin", TEACHER: "Teacher", STUDENT: "Student", LEAD_TEACHER: "Lead teacher", CO_TEACHER: "Co-teacher",
};

export function Badge({ value, tone }: { value: string; tone?: Tone }) {
  const { t } = useTranslation();
  const key = LABEL[value];
  const label = key ? t(key) : value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
  return <span className={`org-badge tone-${tone ?? STATUS_TONE[value] ?? "muted"}`}>{label}</span>;
}

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  const { t } = useTranslation();
  if (totalPages <= 1) return <p className="meta" style={{ paddingTop: 10 }}>{t("{{count}} results", { count: total })}</p>;
  return (
    <div className="pagination-bar">
      <span>{t("Page {{page}} of {{totalPages}} · {{count}} results", { page, totalPages, count: total })}</span>
      <div className="pagination-buttons">
        <button className="button button-secondary" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("Previous")}</button>
        <button className="button button-secondary" type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>{t("Next")}</button>
      </div>
    </div>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the value is still selectable */
    }
  };
  return (
    <div className="copy-field">
      <input className="auth-input" readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <button className="button button-secondary" type="button" onClick={copy}>
        {copied ? <Check /> : <Copy />} {copied ? t("Copied") : t("Copy")}
      </button>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="empty-state empty-state-error" role="alert">
      <div className="empty-icon"><AlertTriangle /></div>
      <h2>{t("Couldn't load this")}</h2>
      <p>{message}</p>
      {onRetry ? <button className="button button-secondary" type="button" onClick={onRetry}>{t("Try again")}</button> : null}
    </div>
  );
}

/** Short date in the UI language ("12 Jan 2026" / "12 janv. 2026"), "-" when missing. */
export const formatDate = (value: string | null | undefined) =>
  value ? formatLocaleDate(value, { day: "numeric", month: "short", year: "numeric" }) : "-";
