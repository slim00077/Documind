import type { LucideIcon } from "lucide-react";
import { useSpotlight } from "./InteractiveSpotlight";

type StatCardProps = { icon: LucideIcon; label: string; value: string | number; hint?: string };

export default function StatCard({ icon: Icon, label, value, hint }: StatCardProps) {
  const spotlight = useSpotlight();
  return (
    <div className="stat-card glass-card spotlight tone-blue" {...spotlight}>
      <div className="stat-card-top">
        <span>{label}</span>
        <Icon aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
