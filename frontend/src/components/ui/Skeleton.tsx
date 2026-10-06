import type { CSSProperties } from "react";

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({ className = "", style }: SkeletonProps) {
  return <span className={`skeleton ${className}`} style={style} />;
}

export function SkeletonMetricCard() {
  return (
    <article className="metric-card skeleton-card">
      <Skeleton className="skeleton-icon" />
      <Skeleton className="skeleton-line skeleton-line-sm" />
      <Skeleton className="skeleton-line skeleton-line-lg" />
      <Skeleton className="skeleton-line skeleton-line-md" />
    </article>
  );
}

export function SkeletonDocumentCard() {
  return (
    <div className="document-row skeleton-card">
      <Skeleton className="skeleton-icon skeleton-icon-lg" />
      <div className="document-row-info">
        <Skeleton className="skeleton-line skeleton-line-md" />
        <Skeleton className="skeleton-line skeleton-line-lg" />
      </div>
      <Skeleton className="skeleton-badge" />
    </div>
  );
}
