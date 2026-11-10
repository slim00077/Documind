import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import type fr from "./locales/fr";

/**
 * UI translations. Keys are the English source strings (gettext style), so English needs no
 * dictionary except for plural forms; French lives in ./locales/fr. Every `t("...")` key is
 * type-checked against the French dictionary (see i18next.d.ts), so a missing translation fails
 * `tsc -b`. Dynamic content (document names, document text, AI answers) is never passed to t().
 */
export const SUPPORTED_LANGUAGES = ["en", "fr"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export type TranslationKey = keyof typeof fr;

export const LANGUAGE_STORAGE_KEY = "documind_language";

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", fr: "Français" };

/** "fr", "fr-CA", "FR" -> "fr"; anything unsupported -> null. */
export const toLanguage = (value: unknown): Language | null => {
  if (typeof value !== "string") return null;
  const tag = value.trim().toLowerCase();
  if (tag.startsWith("fr")) return "fr";
  if (tag.startsWith("en")) return "en";
  return null;
};

const readStoredLanguage = (): Language | null => {
  try {
    return toLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
};

/** Explicit choice on this device, then the browser's preferred languages, then English. */
const detectLanguage = (): Language => {
  const stored = readStoredLanguage();
  if (stored) return stored;
  if (typeof navigator !== "undefined") {
    const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of preferred) {
      const match = toLanguage(tag);
      if (match) return match;
    }
  }
  return "en";
};

export const currentLanguage = (): Language => toLanguage(i18n.resolvedLanguage ?? i18n.language) ?? "en";

/** BCP 47 locale used by Intl formatters for the active UI language. */
export const intlLocale = (language: Language = currentLanguage()): string => (language === "fr" ? "fr-FR" : "en-US");

const applyDocumentLanguage = (language: Language) => {
  if (typeof document !== "undefined") document.documentElement.lang = language;
};

const initialLanguage = detectLanguage();

void i18n.use(initReactI18next).init({
  // French is not bundled: it is loaded on demand (below), so English visitors never download it.
  resources: { en: { translation: en } },
  partialBundledLanguages: true,
  lng: initialLanguage,
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LANGUAGES,
  nonExplicitSupportedLngs: true,
  load: "languageOnly",
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
  react: { useSuspense: false },
});

applyDocumentLanguage(initialLanguage);

i18n.on("languageChanged", (lng) => {
  const language = toLanguage(lng) ?? "en";
  applyDocumentLanguage(language);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* storage unavailable: the choice just won't survive a refresh */
  }
});

const loaders: Partial<Record<Language, () => Promise<{ default: typeof fr }>>> = {
  fr: () => import("./locales/fr"),
};

async function loadLanguage(language: Language): Promise<void> {
  const load = loaders[language];
  if (!load || i18n.hasResourceBundle(language, "translation")) return;
  const { default: resources } = await load();
  i18n.addResourceBundle(language, "translation", resources, true, true);
}

/** Switches the UI language, loading its dictionary first. Use this instead of i18n.changeLanguage. */
export async function changeLanguage(language: Language): Promise<void> {
  await loadLanguage(language);
  await i18n.changeLanguage(language);
}

/**
 * Resolves once the initial language's dictionary is available; main.tsx renders after it, so a
 * French visitor never sees English first. If the chunk fails to load, the UI stays in English.
 */
export const i18nReady: Promise<void> = (initialLanguage === "en" ? Promise.resolve() : changeLanguage(initialLanguage)).catch(
  () => undefined,
);

export default i18n;
