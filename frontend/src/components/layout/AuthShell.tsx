import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TranslationKey } from "../../i18n";
import Brand from "../ui/Brand";
import LanguageSwitcher from "../i18n/LanguageSwitcher";

const POINTS: TranslationKey[] = [
  "Ask questions and get answers with clickable citations",
  "Search by meaning, not just keywords",
  "Summaries, comparison and study questions on demand",
];

export default function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="auth-split">
      <aside className="auth-aside">
        <Brand />
        <div>
          <h2>{t("Turn your documents into knowledge.")}</h2>
          <p>{t("DocuMind combines document management with AI so you can find, understand and use what your files contain.")}</p>
          <ul className="auth-points">
            {POINTS.map((point) => (
              <li key={point}>
                <Check aria-hidden="true" />
                {t(point)}
              </li>
            ))}
          </ul>
        </div>
        <small>&copy; {new Date().getFullYear()} DocuMind</small>
      </aside>
      <main className="auth-main">
        <div className="auth-shell">
          <div className="auth-topline">
            <Link className="auth-back" to="/">
              <ArrowLeft aria-hidden="true" /> {t("Back to home")}
            </Link>
            <LanguageSwitcher variant="inline" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
