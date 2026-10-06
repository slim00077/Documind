import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  FileSearch,
  FolderTree,
  LogOut,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import SiteFooter from "../components/layout/SiteFooter";

const features = [
  { icon: BrainCircuit, title: "AI understanding", text: "Turn complex documents into accessible knowledge." },
  { icon: FileSearch, title: "Intelligent search", text: "Find the right information when it matters." },
  { icon: FolderTree, title: "Thoughtful organization", text: "Keep a growing document library clear and structured." },
  { icon: Bot, title: "Ask your documents", text: "Bring document context into AI conversations." },
  { icon: ShieldCheck, title: "Secure by design", text: "A focused home for your important document work." },
];

const steps = ["Upload", "Process", "Understand", "Ask AI"];

export default function WelcomePage() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="welcome-page">
      <header className="welcome-nav">
        <Link className="brand" to="/">
          <span className="brand-mark">D</span>
          <span>DocuMind</span>
        </Link>
        {isAuthenticated ? (
          <nav aria-label="Welcome navigation">
            <Link to="/">Home</Link>
            <Link to="/app/dashboard">Dashboard</Link>
            <Link to="/app/documents">Documents</Link>
            <Link to="/app/assistant">AI Assistant</Link>
          </nav>
        ) : (
          <nav aria-label="Welcome navigation">
            <a href="#top">Home</a>
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
          </nav>
        )}
        <div className="welcome-actions">
          {isAuthenticated ? (
            <>
              <div className="user-avatar" title={user?.email ?? ""}>
                {user?.name?.slice(0, 1).toUpperCase() ?? "D"}
              </div>
              <button className="button button-secondary" type="button" onClick={onLogout}>
                <LogOut /> Logout
              </button>
            </>
          ) : (
            <>
              <Link className="text-link" to="/login">
                Login
              </Link>
              <Link className="button button-primary" to="/register">
                Get started <ArrowRight />
              </Link>
            </>
          )}
        </div>
      </header>
      <main>
        <section className="hero-section" id="top">
          <div className="hero-copy">
            <p className="section-kicker">
              <Sparkles /> Intelligent document management
            </p>
            <h1>
              Make every document <span>understandable.</span>
            </h1>
            <p>
              DocuMind is a calm, intelligent workspace for organizing documents, discovering what
              they contain, and preparing your knowledge for AI.
            </p>
            <div className="hero-actions">
              {isAuthenticated ? (
                <Link className="button button-primary" to="/app/dashboard">
                  Go to Dashboard <ArrowRight />
                </Link>
              ) : (
                <>
                  <Link className="button button-primary" to="/register">
                    Get started <ArrowRight />
                  </Link>
                  <Link className="button button-secondary" to="/login">
                    Login
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <div className="orbit-core">
              <BrainCircuit />
              <span>AI-ready</span>
            </div>
            <div className="orbit-tag tag-one">Search</div>
            <div className="orbit-tag tag-two">Organize</div>
            <div className="orbit-tag tag-three">Understand</div>
          </div>
        </section>
        <section className="welcome-section" id="features">
          <div className="section-intro">
            <p className="section-kicker">Everything in one place</p>
            <h2>A smarter home for document work</h2>
            <p>Designed to keep useful information close, structured, and ready for the next question.</p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text }) => (
              <article className="feature-card" key={title}>
                <Icon />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="welcome-section how-section" id="how-it-works">
          <div className="section-intro">
            <p className="section-kicker">A simple flow</p>
            <h2>From file to insight</h2>
          </div>
          <div className="steps-grid">
            {steps.map((step, index) => (
              <article className="step-card" key={step}>
                <span>0{index + 1}</span>
                <Upload />
                <h3>{step}</h3>
                <p>
                  {index === 0
                    ? "Bring your files into one focused workspace."
                    : index === 1
                      ? "Chunk and embed document content for smarter retrieval."
                      : index === 2
                        ? "Explore a clear, organized knowledge base."
                        : "Ask AI questions and get answers grounded in your documents."}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className="final-cta" id="about">
          <p className="section-kicker">Built for clarity</p>
          <h2>Your documents should work harder for you.</h2>
          <p>Start building a more useful document workspace with DocuMind.</p>
          {isAuthenticated ? (
            <Link className="button button-primary" to="/app/documents">
              Open your workspace <ArrowRight />
            </Link>
          ) : (
            <Link className="button button-primary" to="/register">
              Create your workspace <ArrowRight />
            </Link>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
