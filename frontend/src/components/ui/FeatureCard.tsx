import { ArrowRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { GlassTone } from "./GlassCard";
import { useSpotlight } from "./InteractiveSpotlight";

type FeatureCardProps = {
  icon: LucideIcon;
  title: string;
  text: string;
  to?: string;
  href?: string;
  action?: string;
  tone?: GlassTone;
};

export default function FeatureCard({ icon: Icon, title, text, to, href, action, tone = "violet" }: FeatureCardProps) {
  const { t } = useTranslation();
  const spotlight = useSpotlight();
  const className = `feature-card glass-card spotlight tone-${tone}`;
  const body = (
    <>
      <span className="feature-icon" aria-hidden="true">
        <Icon />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {to || href ? (
        <span className="feature-link">
          {action ?? t("Open")} <ArrowRight />
        </span>
      ) : null}
    </>
  );
  if (to) {
    return (
      <Link className={className} to={to} {...spotlight}>
        {body}
      </Link>
    );
  }
  if (href) {
    return (
      <a className={className} href={href} {...spotlight}>
        {body}
      </a>
    );
  }
  return (
    <div className={className} {...spotlight}>
      {body}
    </div>
  );
}
