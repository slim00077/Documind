import { Link } from "react-router-dom";
import {
  ArrowRight,
  FileSearch,
  GraduationCap,
  LayoutDashboard,
  Lock,
  MessageSquareText,
  ScanText,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import PublicHeader from "../components/layout/PublicHeader";
import SiteFooter from "../components/layout/SiteFooter";
import AnimatedBackground from "../components/ui/AnimatedBackground";
import FeatureCard from "../components/ui/FeatureCard";
import AnimatedHeroVisual from "../components/landing/AnimatedHeroVisual";
import ProductDemoPanel, { type DemoKind } from "../components/landing/ProductDemoPanel";
import { useAuth } from "../context/AuthContext";
import { homePath } from "../config/roles";

const BENEFITS: {
  id: string;
  kind: DemoKind;
  title: string;
  short: string;
  text: string;
  icon: typeof Sparkles;
  tone: "violet" | "cyan" | "blue" | "lavender";
}[] = [
  { id: "ask", kind: "assistant", icon: MessageSquareText, tone: "violet", title: "Ask your documents", short: "Questions in plain language, answers with sources.", text: "Type a question the way you would ask a colleague. The answer comes from your own files, with numbered references that open the exact passage." },
  { id: "find", kind: "search", icon: FileSearch, tone: "cyan", title: "Find information instantly", short: "Search by meaning, not just keywords.", text: "Describe what you are looking for and land on the right page, even when the document uses different words." },
  { id: "understand", kind: "intelligence", icon: ScanText, tone: "blue", title: "Understand documents faster", short: "Summaries and key facts, pulled out for you.", text: "Turn a long file into a short summary, with the dates, names and figures that matter listed beside it." },
  { id: "compare", kind: "compare", icon: Scale, tone: "lavender", title: "Compare and discover", short: "See what matches and what changed.", text: "Place two documents side by side to spot similarities and differences, and find related files you forgot you had." },
];

const STEPS = [
  { title: "Upload", text: "Add PDFs, Word files, spreadsheets or images to your library." },
  { title: "Ask", text: "Chat with the assistant or search across everything you own." },
  { title: "Understand", text: "Get cited answers, summaries and comparisons in seconds." },
];

const AUDIENCE = [
  { icon: GraduationCap, tone: "violet", title: "On your own", text: "A private library with an assistant that reads your notes, papers and reports. No organization needed." },
  { icon: Users, tone: "blue", title: "With your team or class", text: "Share documents with a group and let everyone ask questions of the same sources." },
  { icon: LayoutDashboard, tone: "lavender", title: "For schools and companies", text: "Run your own organization with teachers, groups, invitations and clear access control." },
] as const;

export default function WelcomePage() {
  const { isAuthenticated, user } = useAuth();
  const primary = isAuthenticated ? { to: homePath(user?.role), label: "Open dashboard" } : { to: "/register", label: "Get started" };

  return (
    <div className="app landing">
      <AnimatedBackground />
      <PublicHeader />
      <main id="top">
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="hero-eyebrow">
                <Sparkles aria-hidden="true" /> AI for your documents
              </p>
              <h1>
                Your Documents. <span>Smarter.</span> With AI.
              </h1>
              <p className="hero-lead">
                Upload your files and ask questions in plain language. DocuMind answers from what you wrote, and shows you exactly
                where each answer came from.
              </p>
              <div className="hero-actions">
                <Link className="button button-primary button-lg" to={primary.to}>
                  {primary.label} <ArrowRight />
                </Link>
                <a className="button button-secondary button-lg" href="#features">
                  See what it does
                </a>
              </div>
              <p className="hero-note">
                <Lock aria-hidden="true" /> Your documents stay private to you.
              </p>
            </div>
            <AnimatedHeroVisual />
          </div>
        </section>

        <section className="section tight" id="features" aria-label="What DocuMind does">
          <div className="feature-strip">
            {BENEFITS.map(({ id, icon, tone, title, short }) => (
              <FeatureCard key={id} icon={icon} tone={tone} title={title} text={short} href={`#${id}`} action="See an example" />
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="benefits-title">
          <div className="section-intro">
            <p className="section-kicker">What you can do</p>
            <h2 id="benefits-title">Less searching. More understanding.</h2>
          </div>
          {BENEFITS.map(({ id, kind, title, text }, index) => (
            <div className={`benefit ${index % 2 ? "flip" : ""}`} id={id} key={id}>
              <div className="benefit-copy">
                <span className="benefit-num">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              <ProductDemoPanel kind={kind} />
            </div>
          ))}
        </section>

        <section className="band" id="how-it-works">
          <div className="section">
            <div className="section-intro">
              <p className="section-kicker">How it works</p>
              <h2>Three steps from file to answer</h2>
            </div>
            <ol className="steps">
              {STEPS.map(({ title, text }, index) => (
                <li className="step" key={title}>
                  <span className="step-num">{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section" id="about">
          <div className="section-intro">
            <p className="section-kicker">Who it is for</p>
            <h2>Use it alone, or bring your organization</h2>
          </div>
          <div className="audience">
            {AUDIENCE.map((item) => (
              <FeatureCard key={item.title} {...item} />
            ))}
          </div>
          <p className="trust-note">
            <ShieldCheck aria-hidden="true" /> Private documents are never visible to other users.
          </p>
        </section>

        <section className="final-cta" aria-labelledby="cta-title">
          <h2 id="cta-title">Start with one document.</h2>
          <p>Create an account, upload a file and ask it a question.</p>
          <Link className="button button-primary button-lg" to={primary.to}>
            {primary.label} <ArrowRight />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
