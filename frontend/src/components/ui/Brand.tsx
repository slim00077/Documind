import { useId } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

/** Geometric document with a folded corner, text lines, and a small connected spark. */
export function LogoMark({ size = 32 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b7cf6" />
          <stop offset="1" stopColor="#4f46c8" />
        </linearGradient>
        <linearGradient id={`${id}-sp`} x1="20" y1="3" x2="26" y2="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a5f3fc" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}-bg)`} />
      <rect x=".5" y=".5" width="31" height="31" rx="8.5" stroke="#fff" strokeOpacity=".22" />
      <path d="M9.5 7.5h7l5 5v10.5a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2v-13.5a2 2 0 0 1 2-2Z" fill="#fff" fillOpacity=".95" />
      <path d="M16.5 7.5v3.4a1.6 1.6 0 0 0 1.6 1.6h3.4" fill="#7c6cf0" fillOpacity=".3" />
      <path d="M12 17.5h6M12 20.5h3.5" stroke="#5645c9" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M17.2 14.2 21.4 9.8" stroke="#38bdf8" strokeWidth=".9" strokeLinecap="round" strokeOpacity=".8" />
      <path d="M23 3.6l.95 2.45 2.45.95-2.45.95L23 10.4l-.95-2.45-2.45-.95 2.45-.95Z" fill={`url(#${id}-sp)`} />
    </svg>
  );
}

export default function Brand({ to = "/" }: { to?: string }) {
  const { t } = useTranslation();
  return (
    <Link className="brand" to={to} aria-label={t("DocuMind home")}>
      <LogoMark />
      <span className="brand-word">
        Docu<b>Mind</b>
      </span>
    </Link>
  );
}
