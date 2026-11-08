import { Link } from "react-router-dom";
import Brand from "../ui/Brand";

const COLUMNS: { heading: string; links: { label: string; to: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", to: "/#features" },
      { label: "How it works", to: "/#how-it-works" },
      { label: "Get started", to: "/register" },
      { label: "Log in", to: "/login" },
    ],
  },
  {
    heading: "Company",
    links: [{ label: "About", to: "/#about" }],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms of Service", to: "/terms" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <Brand />
            <p>
              AI-powered document management. Search, summarize, compare and question your documents, with answers that
              point back to their sources.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav className="footer-col" key={column.heading} aria-label={column.heading}>
              <h3>{column.heading}</h3>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} DocuMind. All rights reserved.</span>
          <span>Documents stay private to their owners and the people they are shared with.</span>
        </div>
      </div>
    </footer>
  );
}
