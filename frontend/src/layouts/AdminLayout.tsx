import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ChartNoAxesCombined,
  Bot,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "../components/notifications/NotificationBell";

const navigation = [
  { to: "overview", label: "Overview", icon: LayoutDashboard },
  { to: "users", label: "Users & Permissions", icon: Users },
  { to: "documents", label: "Documents", icon: FileText },
  { to: "ai-monitoring", label: "AI Monitoring", icon: Bot },
  { to: "audit-logs", label: "Audit Logs", icon: ClipboardList },
];

export default function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const closeMenu = () => setMenuOpen(false);
  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="main-app-shell">
      <button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
        <Menu />
      </button>
      {menuOpen ? <button className="sidebar-backdrop" aria-label="Close navigation" type="button" onClick={closeMenu} /> : null}
      <aside className={`main-sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="sidebar-top">
          <NavLink className="brand" to="/admin" onClick={closeMenu}>
            <span className="brand-mark">D</span>
            <span>Admin</span>
          </NavLink>
          <button className="sidebar-close" type="button" aria-label="Close navigation" onClick={closeMenu}>
            <X />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Admin navigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              onClick={closeMenu}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
          <NavLink to="/app/dashboard" className="sidebar-link" onClick={closeMenu}>
            <ChartNoAxesCombined />
            <span>Back to workspace</span>
          </NavLink>
        </nav>
        <div className="sidebar-user">
          <div className="user-avatar">{user?.name?.slice(0, 1).toUpperCase() ?? "A"}</div>
          <div className="user-details">
            <strong>{user?.name ?? "Admin"}</strong>
            <span>{user?.email ?? ""}</span>
          </div>
        </div>
        <button className="sidebar-link logout-button" type="button" onClick={onLogout}>
          <LogOut />
          <span>Logout</span>
        </button>
      </aside>
      <main className="main-workspace">
        <header className="workspace-header">
          <div>
            <p className="workspace-eyebrow">DocuMind admin</p>
            <span>Manage users, permissions, and platform activity.</span>
          </div>
          <div className="header-actions">
            <NotificationBell />
            <div className="header-avatar">{user?.name?.slice(0, 1).toUpperCase() ?? "A"}</div>
          </div>
        </header>
        <div className="workspace-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
