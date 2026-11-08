import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Building2, ChevronDown, LogOut, Menu, Moon, Search, Settings, Sun, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { NAV_BY_ROLE, ROLE_LABEL, homePath, normalizeRole, type AppRole } from "../../config/roles";
import Brand from "../ui/Brand";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import { useWorkspace } from "../../context/WorkspaceContext";
import { orgNav } from "../../config/orgNav";
import AnimatedBackground from "../ui/AnimatedBackground";
import SiteFooter from "./SiteFooter";
import FloatingAssistant from "../assistant/FloatingAssistant";
import NotificationBell from "../notifications/NotificationBell";

const linkClass = ({ isActive }: { isActive: boolean }) => `topnav-link ${isActive ? "active" : ""}`;

export default function AppShell() {
  const { user, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const role = normalizeRole(user?.role);
  const { current: workspace, isLoading: workspaceLoading } = useWorkspace();
  const links = workspace ? orgNav(workspace.organization.id, workspace.role) : NAV_BY_ROLE[role];
  // In an organization workspace the chip shows the role held there, not the platform role.
  const chipRole: AppRole = workspace ? workspace.role : role;
  const homeTo = workspace ? `/org/${workspace.organization.id}` : homePath(user?.role);
  const initial = user?.name?.slice(0, 1).toUpperCase() ?? "D";

  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setDrawerOpen(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate("/app/search");
      }
    };
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [navigate]);

  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app">
      <AnimatedBackground variant="app" />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand to={homeTo} />
          <nav className="topnav" aria-label="Main navigation">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass} end={Boolean(workspace) && to === `/org/${workspace?.organization.id}`}>
                <Icon aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-actions">
            <Link className="search-shortcut" to="/app/search" aria-label="Search documents (Ctrl+K)">
              <Search aria-hidden="true" /> <span className="sc-label">Search</span> <span className="kbd sc-label">Ctrl K</span>
            </Link>
            <WorkspaceSwitcher />
            <NotificationBell />
            <div className="user-menu" ref={menuRef}>
              <button
                className="user-menu-trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="avatar" aria-hidden="true">
                  {initial}
                </span>
                <span className={`role-chip role-${chipRole.toLowerCase()} hide-sm`}>{ROLE_LABEL[chipRole]}</span>
                <ChevronDown aria-hidden="true" />
              </button>
              {menuOpen ? (
                <div className="menu-panel" role="menu">
                  <div className="menu-head">
                    <strong>{user?.name}</strong>
                    <span>{user?.email}</span>
                    <span className={`role-chip role-${chipRole.toLowerCase()}`}>{ROLE_LABEL[chipRole]}</span>
                  </div>
                  <Link className="menu-item" role="menuitem" to="/app/join">
                    <Building2 aria-hidden="true" />
                    Organizations
                  </Link>
                  <Link className="menu-item" role="menuitem" to="/app/settings">
                    <Settings aria-hidden="true" />
                    Profile &amp; settings
                  </Link>
                  <button
                    className="menu-item"
                    role="menuitem"
                    type="button"
                    onClick={() => setTheme(resolvedTheme === "dark" ? "LIGHT" : "DARK")}
                  >
                    {resolvedTheme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                    {resolvedTheme === "dark" ? "Light appearance" : "Dark appearance"}
                  </button>
                  <div className="menu-sep" />
                  <button className="menu-item danger" role="menuitem" type="button" onClick={onLogout}>
                    <LogOut aria-hidden="true" />
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
            <button
              className="icon-btn menu-toggle"
              type="button"
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((open) => !open)}
            >
              {drawerOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {drawerOpen ? (
        <nav className="nav-drawer" aria-label="Mobile navigation">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          <NavLink to="/app/search" className={linkClass}>
            <Search aria-hidden="true" />
            Search
          </NavLink>
          <NavLink to="/app/settings" className={linkClass}>
            <Settings aria-hidden="true" />
            Profile &amp; settings
          </NavLink>
          <div className="nav-drawer-actions">
            <span className={`role-chip role-${role.toLowerCase()}`}>{ROLE_LABEL[role]}</span>
            <button className="button button-secondary" type="button" onClick={onLogout}>
              <LogOut />
              Log out
            </button>
          </div>
        </nav>
      ) : null}
      <main id="main" className="app-main" tabIndex={-1}>
        {workspaceLoading ? <p className="auth-hint">Loading your workspace...</p> : <Outlet />}
      </main>
      <SiteFooter />
      {role !== "ADMIN" ? <FloatingAssistant /> : null}
    </div>
  );
}
