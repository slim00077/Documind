import { Link } from "react-router-dom";

const FOOTER_COLUMNS: { heading: string; links: { label: string; to: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", to: "/#features" },
      { label: "How it works", to: "/#how-it-works" },
      { label: "Get started", to: "/register" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", to: "/#about" },
      { label: "Contact", to: "/#about" },
    ],
  },
  {
    heading: "Navigation",
    links: [
      { label: "Login", to: "/login" },
      { label: "Documents", to: "/app/documents" },
      { label: "AI Assistant", to: "/app/assistant" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy policy", to: "/#about" },
      { label: "Terms of service", to: "/#about" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-top">
        <div className="site-footer-brand">
          <span className="brand">
            <span className="brand-mark">D</span>
            <span>DocuMind</span>
          </span>
          <p>Intelligent document management for teams who want clarity, not clutter.</p>
        </div>
        <div className="site-footer-columns">
          {FOOTER_COLUMNS.map((column) => (
            <div className="site-footer-column" key={column.heading}>
              <h3>{column.heading}</h3>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>&copy; {new Date().getFullYear()} DocuMind. All rights reserved.</span>
        <span>Built for clearer document work.</span>
      </div>
    </footer>
  );
}
