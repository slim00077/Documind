import { currentLanguage, intlLocale } from "./index";

/**
 * Locale-aware formatting for the active UI language. Formatters are cached per locale and
 * options; components re-render on language change through useTranslation().
 */
const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>();

const cached = <T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>(
  kind: string,
  options: object | undefined,
  create: (locale: string) => T,
): T => {
  const locale = intlLocale();
  const key = `${kind}|${locale}|${JSON.stringify(options ?? {})}`;
  let formatter = cache.get(key) as T | undefined;
  if (!formatter) {
    formatter = create(locale);
    cache.set(key, formatter);
  }
  return formatter;
};

type DateInput = string | number | Date;

const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));

export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return cached("date", options, (locale) => new Intl.DateTimeFormat(locale, options)).format(date);
}

export const formatDateTime = (value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) =>
  formatDate(value, options);

export const formatTime = (value: DateInput, options: Intl.DateTimeFormatOptions = { timeStyle: "short" }) => formatDate(value, options);

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) return String(value);
  return cached("number", options, (locale) => new Intl.NumberFormat(locale, options)).format(value);
}

/** 0.42 -> "42%" / "42 %" (French puts a narrow no-break space before the sign). */
export const formatPercent = (ratio: number, maximumFractionDigits = 0) =>
  formatNumber(ratio, { style: "percent", maximumFractionDigits });

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["week", 1000 * 60 * 60 * 24 * 7],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
];

export function formatRelativeTime(value: DateInput): string {
  const time = toDate(value).getTime();
  if (Number.isNaN(time)) return "";
  const formatter = cached("relative", { numeric: "auto" }, (locale) => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }));
  const diffMs = time - Date.now();
  const absMs = Math.abs(diffMs);
  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (absMs >= unitMs) return formatter.format(Math.round(diffMs / unitMs), unit);
  }
  return formatter.format(Math.round(diffMs / 1000), "second");
}

const FILE_UNITS = {
  en: ["B", "KB", "MB", "GB"],
  fr: ["o", "Ko", "Mo", "Go"],
} as const;

/** 1536 -> "1.5 KB" in English, "1,5 Ko" in French. */
export function formatFileSize(bytes: number): string {
  const units = FILE_UNITS[currentLanguage()];
  if (bytes < 1024) return `${formatNumber(bytes)} ${units[0]}`;
  let value = bytes / 1024;
  let unitIndex = 1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value < 10 ? 1 : 0;
  return `${formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${units[unitIndex]}`;
}
