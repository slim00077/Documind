import type { ComponentType, ReactNode } from "react";

type PageStateProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  message?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  tone?: "default" | "error";
};

export function PageState({
  icon: Icon,
  title,
  message,
  action,
  compact,
  tone = "default",
}: PageStateProps) {
  return (
    <div
      className={`empty-state ${compact ? "compact-empty" : ""} ${
        tone === "error" ? "empty-state-error" : ""
      }`}
      role={tone === "error" ? "alert" : undefined}
    >
      <div className="empty-icon">
        <Icon />
      </div>
      <h2>{title}</h2>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}
