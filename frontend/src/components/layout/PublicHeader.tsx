import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { homePath } from "../../config/roles";
import type { TranslationKey } from "../../i18n";
import Brand from "../ui/Brand";
import LanguageSwitcher from "../i18n/LanguageSwitcher";

const LINKS: { href: string; label: TranslationKey }[] = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#about", label: "About" },
];

export default function PublicHeader() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const [open, setOpen] = useState(false);

  const actions = isAuthenticated ? (
    <Link className="button button-primary" to={homePath(user?.role)}>
      {t("Open dashboard")}
    </Link>
  ) : (
    <>
      <Link className="button button-ghost" to="/login">
        {t("Login")}
      </Link>
      <Link className="button button-primary" to="/register">
        {t("Get Started")}
      </Link>
    </>
  );

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav className="topnav" aria-label={t("Site navigation")}>
            {LINKS.map((link) => (
              <Link key={link.label} to={link.href} className="topnav-link">
                {t(link.label)}
              </Link>
            ))}
          </nav>
          <div className="topbar-actions">
            <LanguageSwitcher className="hide-sm" />
            <div className="hide-sm public-actions">{actions}</div>
            <button
              className="icon-btn menu-toggle"
              type="button"
              aria-label={open ? t("Close menu") : t("Open menu")}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {open ? (
        <nav className="nav-drawer" aria-label={t("Mobile navigation")} onClick={() => setOpen(false)}>
          {LINKS.map((link) => (
            <Link key={link.label} to={link.href} className="topnav-link">
              {t(link.label)}
            </Link>
          ))}
          <div className="nav-drawer-actions">
            {/* Changing the language keeps the drawer open: the click must not reach the nav's close handler. */}
            <div onClick={(event) => event.stopPropagation()}>
              <LanguageSwitcher variant="inline" />
            </div>
            {actions}
          </div>
        </nav>
      ) : null}
    </>
  );
}
