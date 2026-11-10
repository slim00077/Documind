import { FileSpreadsheet, FileText, Image as ImageIcon, Search, Sparkles } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import GlassCard, { type GlassTone } from "../ui/GlassCard";

type DocChipProps = {
  className: string;
  tone: GlassTone;
  kind: string;
  name: string;
  meta: string;
  icon: ReactNode;
};

function DocChip({ className, tone, kind, name, meta, icon }: DocChipProps) {
  return (
    <GlassCard tone={tone} className={`hv-doc ${className}`}>
      <span className={`hv-doc-icon k-${kind}`}>{icon}</span>
      <span className="hv-doc-text">
        <strong>{name}</strong>
        <small>{meta}</small>
      </span>
    </GlassCard>
  );
}

/** Connection endpoints (percent of the stage) for the four document cards and the AI core. */
const CORE = [50, 42] as const;
const LINKS = [
  { from: [14, 7], bend: [28, 24] },
  { from: [86, 11], bend: [72, 26] },
  { from: [16, 60], bend: [30, 52] },
  { from: [86, 63], bend: [70, 54] },
] as const;

/** Design widths: the stage is laid out at a fixed size and scaled to fit its column. */
const FULL = 560;
const COMPACT = 400;
const HEIGHT = 600;

/**
 * The hero composition: an AI core connected to floating documents, with small panels showing
 * what it does with them. Built from HTML + one SVG overlay; motion is CSS only.
 */
export default function AnimatedHeroVisual() {
  const { t } = useTranslation();
  const fitRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FULL);

  useLayoutEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || FULL);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const compact = width < 480;
  const design = compact ? COMPACT : FULL;
  const scale = Math.min(1.1, width / design);

  return (
    <div ref={fitRef} className="hv-fit" style={{ height: HEIGHT * scale }}>
    <div
      className={`hv ${compact ? "compact" : ""}`}
      style={{ width: design, height: HEIGHT, transform: `scale(${scale})` }}
      role="img"
      aria-label={t("DocuMind connects your PDF, Word, Excel and image files, extracts key facts and answers questions with sources.")}
    >
      <div className="hv-glow" aria-hidden="true" />

      <svg className="hv-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {LINKS.map(({ from, bend }, index) => (
          <g key={index}>
            <path className="hv-line" d={`M ${from[0]} ${from[1]} C ${bend[0]} ${bend[1]}, ${CORE[0]} ${CORE[1] - 12}, ${CORE[0]} ${CORE[1]}`} vectorEffect="non-scaling-stroke" />
            <path className="hv-line flow" style={{ animationDelay: `${index * -1.1}s` }} d={`M ${from[0]} ${from[1]} C ${bend[0]} ${bend[1]}, ${CORE[0]} ${CORE[1] - 12}, ${CORE[0]} ${CORE[1]}`} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>

      {/* Illustrative sample files for the marketing visual, translated like the rest of the copy. */}
      <DocChip className="d-pdf" tone="violet" kind="pdf" name={t("Contract.pdf")} meta={t("{{count}} pages", { count: 24 })} icon={<FileText />} />
      <DocChip className="d-docx" tone="blue" kind="docx" name={t("Renewal.docx")} meta={t("{{count}} pages", { count: 8 })} icon={<FileText />} />
      <DocChip className="d-xlsx" tone="cyan" kind="xlsx" name={t("Budget-Q3.xlsx")} meta={t("{{count}} sheets", { count: 3 })} icon={<FileSpreadsheet />} />
      <DocChip className="d-img" tone="lavender" kind="img" name={t("Scan.png")} meta={t("Text recognised")} icon={<ImageIcon />} />

      <GlassCard tone="violet" tilt className="hv-core">
        <svg className="hv-emblem" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <path d="M18 10h20l12 12v28a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4Z" fill="rgba(255,255,255,.12)" stroke="rgba(200,210,255,.7)" strokeWidth="1.5" />
          <path d="M38 10v9a3 3 0 0 0 3 3h9" stroke="rgba(200,210,255,.6)" strokeWidth="1.5" />
          <path d="M22 32h14M22 39h10M22 46h14" stroke="rgba(200,210,255,.55)" strokeWidth="2" strokeLinecap="round" />
          <path d="M47 6l1.8 4.7 4.7 1.8-4.7 1.8L47 19l-1.8-4.7-4.7-1.8 4.7-1.8Z" fill="#7fe0f2" />
        </svg>
        <span className="hv-core-title">DocuMind AI</span>
        <span className="hv-core-status"><i /> {t("Reading {{count}} documents", { count: 4 })}</span>
        <span className="hv-bar"><b /></span>
      </GlassCard>

      <GlassCard tone="blue" className="hv-panel hv-extract">
        <p className="hv-panel-label"><Sparkles /> {t("Key information")}</p>
        <div className="hv-chips">
          <span><Trans i18nKey="Notice <b>60 days</b>" components={{ b: <b /> }} /></span>
          <span><Trans i18nKey="Value <b>€48,000</b>" components={{ b: <b /> }} /></span>
          <span><Trans i18nKey="Renewal <b>12 Jan</b>" components={{ b: <b /> }} /></span>
        </div>
      </GlassCard>

      <GlassCard tone="violet" className="hv-panel hv-ask">
        <div className="hv-search">
          <Search /> <span>{t("What notice period applies?")}</span>
        </div>
        <p className="hv-answer">
          <Trans
            i18nKey="60 days written notice before termination <c>1</c>, 30 days for renewal changes <c>2</c>."
            components={{ c: <span className="cite" /> }}
          />
        </p>
        <div className="hv-sources">
          <span><FileText /> {t("Contract.pdf · p.4")}</span>
          <span><FileText /> {t("Renewal.docx · p.2")}</span>
        </div>
      </GlassCard>
    </div>
    </div>
  );
}
