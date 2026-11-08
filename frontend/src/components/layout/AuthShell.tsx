import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import Brand from "../ui/Brand";

const POINTS = [
  "Ask questions and get answers with clickable citations",
  "Search by meaning, not just keywords",
  "Summaries, comparison and study questions on demand",
];

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-split">
      <aside className="auth-aside">
        <Brand />
        <div>
          <h2>Turn your documents into knowledge.</h2>
          <p>DocuMind combines document management with AI so you can find, understand and use what your files contain.</p>
          <ul className="auth-points">
            {POINTS.map((point) => (
              <li key={point}>
                <Check aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <small>&copy; {new Date().getFullYear()} DocuMind</small>
      </aside>
      <main className="auth-main">
        <div className="auth-shell">
          <Link className="auth-back" to="/">
            <ArrowLeft aria-hidden="true" /> Back to home
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
