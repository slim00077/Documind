import { useEffect, useRef, useState } from "react";
import { Check, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from "../../i18n";
import { useLanguage } from "../../hooks/useLanguage";

/**
 * EN / FR language picker.
 * - "menu" (top bars): a compact code button opening a small menu, so the navigation keeps its room.
 * - "inline" (mobile drawer, sign-in pages): both languages side by side.
 * Settings has the full-size version.
 */
export default function LanguageSwitcher({ className = "", variant = "menu" }: { className?: string; variant?: "menu" | "inline" }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (variant === "inline") {
    return (
      <div className={`lang-switch ${className}`} role="group" aria-label={t("Language")}>
        {SUPPORTED_LANGUAGES.map((option) => (
          <button
            key={option}
            type="button"
            lang={option}
            className={option === language ? "active" : ""}
            aria-pressed={option === language}
            aria-label={LANGUAGE_NAMES[option]}
            title={LANGUAGE_NAMES[option]}
            onClick={() => void setLanguage(option)}
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`user-menu lang-menu ${className}`} ref={ref}>
      <button
        type="button"
        className="lang-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("Language: {{language}}", { language: LANGUAGE_NAMES[language] })}
        title={t("Language: {{language}}", { language: LANGUAGE_NAMES[language] })}
        onClick={() => setOpen((value) => !value)}
      >
        {language.toUpperCase()}
      </button>
      {open ? (
        <div className="menu-panel lang-panel" role="menu" aria-label={t("Language")}>
          {SUPPORTED_LANGUAGES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === language}
              lang={option}
              className="menu-item"
              onClick={() => {
                setOpen(false);
                void setLanguage(option);
              }}
            >
              <Languages aria-hidden="true" />
              {LANGUAGE_NAMES[option]}
              {option === language ? <Check className="ws-check" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
