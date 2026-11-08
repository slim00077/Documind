import { ArrowRight, Check, FileText, Minus, Search, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import GlassCard from "../ui/GlassCard";

export type DemoKind = "assistant" | "search" | "intelligence" | "compare";

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
  return (
    <Window title="DocuMind · Assistant">
      <div className="bubble q">Which clauses mention late payment?</div>
      <div className="bubble a">
        Late payments accrue 1.5% monthly interest <span className="cite">1</span> after a 10-day grace period{" "}
        <span className="cite">2</span>, and repeated delays allow suspension of service <span className="cite">3</span>.
      </div>
      <ol className="demo-cites">
        <li><span className="cite">1</span> Service contract · §6.2 · p.7</li>
        <li><span className="cite">2</span> Service contract · §6.3 · p.7</li>
        <li><span className="cite">3</span> Support addendum · §2 · p.2</li>
      </ol>
    </Window>
  );
}

function SearchDemo() {
  return (
    <Window title="DocuMind · Search">
      <div className="demo-search"><Search /> termination without cause</div>
      <ul className="demo-results">
        <li>
          <FileText />
          <div><strong>Service contract</strong><span>…either party may end this agreement with <mark>60 days</mark> notice…</span></div>
          <em>96%</em>
        </li>
        <li>
          <FileText />
          <div><strong>Partner agreement</strong><span>…<mark>exit rights</mark> apply when no breach has occurred…</span></div>
          <em>88%</em>
        </li>
        <li>
          <FileText />
          <div><strong>Reseller terms</strong><span>…termination for convenience requires written notice…</span></div>
          <em>71%</em>
        </li>
      </ul>
    </Window>
  );
}

function Intelligence() {
  return (
    <Window title="DocuMind · Document insights">
      <div className="demo-transform">
        <div className="demo-source">
          <p className="demo-label">Service-contract.pdf</p>
          {[92, 100, 84, 96, 70, 100, 88, 60].map((width, index) => (
            <span key={index} style={{ width: `${width}%` }} />
          ))}
        </div>
        <ArrowRight className="demo-arrow" aria-hidden="true" />
        <div className="demo-result">
          <p className="demo-label"><Sparkles /> Summary</p>
          <p className="demo-text">Two-year support agreement with fixed annual pricing, automatic renewal and a 60-day termination clause.</p>
          <p className="demo-label">Extracted</p>
          <div className="demo-chips">
            <span>12 Jan 2025</span>
            <span>Northwind Ltd.</span>
            <span>€48,000 / year</span>
            <span>Governing law · France</span>
          </div>
        </div>
      </div>
    </Window>
  );
}

function Compare() {
  return (
    <Window title="DocuMind · Compare">
      <div className="demo-cmp">
        <div className="cmp-col">
          <p className="demo-label">Contract 2023</p>
          <p className="cmp-line same"><Check /> Payment within 30 days</p>
          <p className="cmp-line diff"><Minus /> Notice period: <mark>30 days</mark></p>
          <p className="cmp-line diff"><Minus /> Liability cap: <mark>€50,000</mark></p>
          <p className="cmp-line same"><Check /> Governed by French law</p>
        </div>
        <div className="cmp-col">
          <p className="demo-label">Contract 2024</p>
          <p className="cmp-line same"><Check /> Payment within 30 days</p>
          <p className="cmp-line diff"><Minus /> Notice period: <mark>60 days</mark></p>
          <p className="cmp-line diff"><Minus /> Liability cap: <mark>€120,000</mark></p>
          <p className="cmp-line same"><Check /> Governed by French law</p>
        </div>
      </div>
      <p className="cmp-summary"><Sparkles /> 2 similarities · 2 differences · 0 contradictions</p>
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
