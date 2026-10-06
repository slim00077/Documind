import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bot, ChartNoAxesCombined, FileText, Home, LogOut, Menu, Settings, ShieldCheck, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import FloatingAssistant from "../components/assistant/FloatingAssistant";
import NotificationBell from "../components/notifications/NotificationBell";

const navigation = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "dashboard", label: "Dashboard", icon: ChartNoAxesCombined },
  { to: "documents", label: "Documents", icon: FileText },
  { to: "assistant", label: "AI Assistant", icon: Bot },
  { to: "settings", label: "Settings", icon: Settings },
];

export default function MainAppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const closeMenu = () => setMenuOpen(false);
  const onLogout = () => { logout(); navigate("/login", { replace: true }); };
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="main-app-shell">
      <button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu /></button>
      {menuOpen ? <button className="sidebar-backdrop" aria-label="Close navigation" type="button" onClick={closeMenu} /> : null}
      <aside className={`main-sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="sidebar-top">
          <NavLink className="brand" to="/app" onClick={closeMenu}><span className="brand-mark">D</span><span>DocuMind</span></NavLink>
          <button className="sidebar-close" type="button" aria-label="Close navigation" onClick={closeMenu}><X /></button>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`} onClick={closeMenu}><Icon /><span>{label}</span></NavLink>)}
          {isAdmin ? (
            <NavLink to="/admin" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`} onClick={closeMenu}>
              <ShieldCheck /><span>Admin</span>
            </NavLink>
          ) : null}
        </nav>
        <div className="sidebar-user">
          <div className="user-avatar">{user?.name?.slice(0, 1).toUpperCase() ?? "D"}</div>
          <div className="user-details"><strong>{user?.name ?? "DocuMind user"}</strong><span>{user?.email ?? ""}</span></div>
        </div>
        <button className="sidebar-link logout-button" type="button" onClick={onLogout}><LogOut /><span>Logout</span></button>
      </aside>
      <main className="main-workspace">
        <header className="workspace-header"><div><p className="workspace-eyebrow">DocuMind workspace</p><span>Organize, understand, and find every document.</span></div><div className="header-actions"><NotificationBell /><div className="header-avatar">{user?.name?.slice(0, 1).toUpperCase() ?? "D"}</div></div></header>
        <div className="workspace-content"><Outlet /></div>
      </main>
      <FloatingAssistant />
    </div>
  );
}
