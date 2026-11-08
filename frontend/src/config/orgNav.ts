import {
  BarChart3,
  Bell,
  Bot,
  Building2,
  Compass,
  FileText,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  MailPlus,
  UserSquare2,
  Users,
  UsersRound,
} from "lucide-react";
import type { NavItem } from "./roles";
import type { OrgRole } from "../services/organizations.api";

/** Navigation inside an organization workspace. UI only: every endpoint re-checks the role server-side. */
export function orgNav(orgId: number, role: OrgRole): NavItem[] {
  const base = `/org/${orgId}`;
  if (role === "ADMIN") {
    return [
      { to: base, label: "Dashboard", icon: LayoutDashboard },
      { to: `${base}/settings`, label: "Organization", icon: Building2 },
      { to: `${base}/teachers`, label: "Teachers", icon: UserSquare2 },
      { to: `${base}/students`, label: "Students", icon: GraduationCap },
      { to: `${base}/groups`, label: "Groups", icon: UsersRound },
      { to: `${base}/invitations`, label: "Invitations", icon: MailPlus },
      { to: `${base}/analytics`, label: "Analytics", icon: BarChart3 },
    ];
  }
  if (role === "TEACHER") {
    return [
      { to: base, label: "Dashboard", icon: LayoutDashboard },
      { to: `${base}/groups`, label: "My Groups", icon: UsersRound },
      { to: `${base}/students`, label: "Students", icon: Users },
      { to: "/app/documents", label: "Documents", icon: FileText },
      { to: "/app/assistant", label: "AI Assistant", icon: Bot },
      { to: `${base}/requests`, label: "Requests", icon: Inbox },
    ];
  }
  return [
    { to: base, label: "Dashboard", icon: LayoutDashboard },
    { to: `${base}/groups`, label: "My Groups", icon: UsersRound },
    { to: `${base}/discover`, label: "Discover Groups", icon: Compass },
    { to: "/app/documents?tab=shared", label: "My Documents", icon: FileText },
    { to: "/app/assistant", label: "AI Assistant", icon: Bot },
    { to: `${base}/notifications`, label: "Notifications", icon: Bell },
  ];
}
