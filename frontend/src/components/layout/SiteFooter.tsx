import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TranslationKey } from "../../i18n";
import Brand from "../ui/Brand";

const COLUMNS: { heading: TranslationKey; links: { label: TranslationKey; to: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", to: "/#features" },
      { label: "How it works", to: "/#how-it-works" },
      { label: "Get started", to: "/register" },
      { label: "Log in", to: "/login" },
    ],
  },
  {
    heading: "Company",
    links: [{ label: "About", to: "/#about" }],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms of Service", to: "/terms" },
    ],
  },
];

export default function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <Brand />
            <p>
              {t("AI-powered document management. Search, summarize, compare and question your documents, with answers that point back to their sources.")}
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav className="footer-col" key={column.heading} aria-label={t(column.heading)}>
              <h3>{t(column.heading)}</h3>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to}>{t(link.label)}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="footer-bottom">
          <span>&copy; {t("{{year}} DocuMind. All rights reserved.", { year: new Date().getFullYear() })}</span>
          <span>{t("Documents stay private to their owners and the people they are shared with.")}</span>
        </div>
      </div>
    </footer>
  );
}
