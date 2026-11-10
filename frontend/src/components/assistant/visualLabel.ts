import type { TFunction } from "i18next";

/**
 * Localizes the fixed origin labels the server attaches to image/scan passages
 * ("uploaded image", "scanned page 3", "image on page 2", "embedded image 1").
 * Anything else is shown unchanged.
 */
export function visualLabel(label: string, t: TFunction): string {
  if (label === "uploaded image") return t("uploaded image");
  if (label === "scanned pages") return t("scanned pages");
  let match = /^scanned page (\d+)$/.exec(label);
  if (match) return t("scanned page {{page}}", { page: match[1] });
  match = /^image on page (\d+)$/.exec(label);
  if (match) return t("image on page {{page}}", { page: match[1] });
  match = /^embedded image (\d+)$/.exec(label);
  if (match) return t("embedded image {{number}}", { number: match[1] });
  return label;
}
