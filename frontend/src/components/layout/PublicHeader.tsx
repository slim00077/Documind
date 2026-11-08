import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { homePath } from "../../config/roles";
import Brand from "../ui/Brand";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#about", label: "About" },
];

export default function PublicHeader() {
  const { isAuthenticated, user } = useAuth();
  const [open, setOpen] = useState(false);

  const actions = isAuthenticated ? (
    <Link className="button button-primary" to={homePath(user?.role)}>
      Open dashboard
    </Link>
  ) : (
    <>
      <Link className="button button-ghost" to="/login">
        Login
      </Link>
      <Link className="button button-primary" to="/register">
        Get Started
      </Link>
    </>
  );

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav className="topnav" aria-label="Site navigation">
            {LINKS.map((link) => (
              <Link key={link.label} to={link.href} className="topnav-link">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="topbar-actions">
            <div className="hide-sm public-actions">{actions}</div>
            <button
              className="icon-btn menu-toggle"
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {open ? (
        <nav className="nav-drawer" aria-label="Mobile navigation" onClick={() => setOpen(false)}>
          {LINKS.map((link) => (
            <Link key={link.label} to={link.href} className="topnav-link">
              {link.label}
            </Link>
          ))}
          <div className="nav-drawer-actions">{actions}</div>
        </nav>
      ) : null}
    </>
  );
}
