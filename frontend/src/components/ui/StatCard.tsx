import type { LucideIcon } from "lucide-react";
import { useSpotlight } from "./InteractiveSpotlight";
import { formatNumber } from "../../i18n/format";

type StatCardProps = { icon: LucideIcon; label: string; value: string | number; hint?: string };

export default function StatCard({ icon: Icon, label, value, hint }: StatCardProps) {
  const spotlight = useSpotlight();
  return (
    <div className="stat-card glass-card spotlight tone-blue" {...spotlight}>
      <div className="stat-card-top">
        <span>{label}</span>
        <Icon aria-hidden="true" />
      </div>
      <strong>{typeof value === "number" ? formatNumber(value) : value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
