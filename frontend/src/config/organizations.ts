import type { TranslationKey } from "../i18n";
import type { OrganizationType } from "../services/organizations.api";

/** Organization types, labelled with translation keys: render with t(ORG_TYPE_LABEL[type]). */
export const ORG_TYPE_LABEL: Record<string, TranslationKey> = {
  SCHOOL: "School",
  UNIVERSITY: "University",
  TRAINING_CENTER: "Training center",
  COMPANY: "Company",
  OTHER: "Organization",
};

/** Options for organization-type selects, in display order. */
export const ORG_TYPE_OPTIONS: { value: OrganizationType; label: TranslationKey }[] = [
  { value: "SCHOOL", label: "School" },
  { value: "UNIVERSITY", label: "University" },
  { value: "TRAINING_CENTER", label: "Training center" },
  { value: "COMPANY", label: "Company" },
  { value: "OTHER", label: "Other" },
];
