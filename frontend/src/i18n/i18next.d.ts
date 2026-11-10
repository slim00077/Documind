import "i18next";
import type fr from "./locales/fr";

// Natural-language keys: "." and ":" are ordinary characters, never separators.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    keySeparator: false;
    nsSeparator: false;
    returnNull: false;
    resources: { translation: typeof fr };
  }
}
