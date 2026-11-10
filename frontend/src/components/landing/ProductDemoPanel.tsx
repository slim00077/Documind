import { ArrowRight, Check, FileText, Minus, Search, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import GlassCard from "../ui/GlassCard";

export type DemoKind = "assistant" | "search" | "intelligence" | "compare";

// Illustrative marketing mock-ups (not user data): their sample text is translated like any copy.
const cite = <span className="cite" />;

function Window({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="demo-bar">
        <i /> <i /> <i />
        <span>{title}</span>
      </div>
      <div className="demo-body">{children}</div>
    </>
  );
}

function Assistant() {
  const { t } = useTranslation();
  return (
    <Window title={t("DocuMind · Assistant")}>
      <div className="bubble q">{t("Which clauses mention late payment?")}</div>
      <div className="bubble a">
        <Trans
          i18nKey="Late payments accrue 1.5% monthly interest <c>1</c> after a 10-day grace period <c>2</c>, and repeated delays allow suspension of service <c>3</c>."
          components={{ c: cite }}
        />
      </div>
      <ol className="demo-cites">
        <li><span className="cite">1</span> {t("Service contract · §6.2 · p.7")}</li>
        <li><span className="cite">2</span> {t("Service contract · §6.3 · p.7")}</li>
        <li><span className="cite">3</span> {t("Support addendum · §2 · p.2")}</li>
      </ol>
    </Window>
  );
}

function SearchDemo() {
  const { t } = useTranslation();
  const mark = <mark />;
  return (
    <Window title={t("DocuMind · Search")}>
      <div className="demo-search"><Search /> {t("termination without cause")}</div>
      <ul className="demo-results">
        <li>
          <FileText />
          <div><strong>{t("Service contract")}</strong><span><Trans i18nKey="…either party may end this agreement with <m>60 days</m> notice…" components={{ m: mark }} /></span></div>
          <em>96%</em>
        </li>
        <li>
          <FileText />
          <div><strong>{t("Partner agreement")}</strong><span><Trans i18nKey="…<m>exit rights</m> apply when no breach has occurred…" components={{ m: mark }} /></span></div>
          <em>88%</em>
        </li>
        <li>
          <FileText />
          <div><strong>{t("Reseller terms")}</strong><span>{t("…termination for convenience requires written notice…")}</span></div>
          <em>71%</em>
        </li>
      </ul>
    </Window>
  );
}

function Intelligence() {
  const { t } = useTranslation();
  return (
    <Window title={t("DocuMind · Document insights")}>
      <div className="demo-transform">
        <div className="demo-source">
          <p className="demo-label">{t("Service-contract.pdf")}</p>
          {[92, 100, 84, 96, 70, 100, 88, 60].map((width, index) => (
            <span key={index} style={{ width: `${width}%` }} />
          ))}
        </div>
        <ArrowRight className="demo-arrow" aria-hidden="true" />
        <div className="demo-result">
          <p className="demo-label"><Sparkles /> {t("Summary")}</p>
          <p className="demo-text">{t("Two-year support agreement with fixed annual pricing, automatic renewal and a 60-day termination clause.")}</p>
          <p className="demo-label">{t("Extracted")}</p>
          <div className="demo-chips">
            <span>{t("12 Jan 2025")}</span>
            <span>Northwind Ltd.</span>
            <span>{t("€48,000 / year")}</span>
            <span>{t("Governing law · France")}</span>
          </div>
        </div>
      </div>
    </Window>
  );
}

function Compare() {
  const { t } = useTranslation();
  const mark = <mark />;
  return (
    <Window title={t("DocuMind · Compare")}>
      <div className="demo-cmp">
        <div className="cmp-col">
          <p className="demo-label">{t("Contract 2023")}</p>
          <p className="cmp-line same"><Check /> {t("Payment within 30 days")}</p>
          <p className="cmp-line diff"><Minus /> <Trans i18nKey="Notice period: <m>30 days</m>" components={{ m: mark }} /></p>
          <p className="cmp-line diff"><Minus /> <Trans i18nKey="Liability cap: <m>€50,000</m>" components={{ m: mark }} /></p>
          <p className="cmp-line same"><Check /> {t("Governed by French law")}</p>
        </div>
        <div className="cmp-col">
          <p className="demo-label">{t("Contract 2024")}</p>
          <p className="cmp-line same"><Check /> {t("Payment within 30 days")}</p>
          <p className="cmp-line diff"><Minus /> <Trans i18nKey="Notice period: <m>60 days</m>" components={{ m: mark }} /></p>
          <p className="cmp-line diff"><Minus /> <Trans i18nKey="Liability cap: <m>€120,000</m>" components={{ m: mark }} /></p>
          <p className="cmp-line same"><Check /> {t("Governed by French law")}</p>
        </div>
      </div>
      <p className="cmp-summary"><Sparkles /> {t("2 similarities · 2 differences · 0 contradictions")}</p>
    </Window>
  );
}

const TONE = { assistant: "violet", search: "cyan", intelligence: "blue", compare: "lavender" } as const;

/** A realistic mock of one DocuMind feature, drawn as a glass window. */
export default function ProductDemoPanel({ kind }: { kind: DemoKind }) {
  return (
    <GlassCard tone={TONE[kind]} tilt className="demo-panel">
      {kind === "assistant" ? <Assistant /> : null}
      {kind === "search" ? <SearchDemo /> : null}
      {kind === "intelligence" ? <Intelligence /> : null}
      {kind === "compare" ? <Compare /> : null}
    </GlassCard>
  );
}
