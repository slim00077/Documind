import {
  BarChart3,
  Bot,
  Building2,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  Scale,
  Search,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AuthUser } from "../services/auth.api";

export type AppRole = "STUDENT" | "TEACHER" | "ADMIN";

// Legacy USER accounts behave as students.
export const normalizeRole = (role: AuthUser["role"] | undefined): AppRole =>
  role === "ADMIN" || role === "TEACHER" ? role : "STUDENT";

export const ROLE_LABEL: Record<AppRole, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  ADMIN: "Admin",
};

export type NavItem = { to: string; label: string; icon: LucideIcon };

// UI convenience only: every protected endpoint is enforced again on the server.
export const NAV_BY_ROLE: Record<AppRole, NavItem[]> = {
  STUDENT: [
    { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/app/documents", label: "My Documents", icon: FileText },
    { to: "/app/assistant", label: "AI Assistant", icon: Bot },
    { to: "/app/search", label: "Search", icon: Search },
    { to: "/app/compare", label: "Comparison", icon: Scale },
    { to: "/app/insights", label: "Insights", icon: Lightbulb },
    { to: "/app/study", label: "Study Tools", icon: GraduationCap },
  ],
  TEACHER: [
    { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/app/documents", label: "Documents", icon: FileText },
    { to: "/app/assistant", label: "AI Assistant", icon: Bot },
    { to: "/app/search", label: "Search", icon: Search },
    { to: "/app/compare", label: "Comparison", icon: Scale },
    { to: "/app/ai-tools", label: "AI Tools", icon: Sparkles },
  ],
  ADMIN: [
    { to: "/admin/overview", label: "Dashboard", icon: LayoutDashboard },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/organizations", label: "Organizations", icon: Building2 },
    { to: "/admin/documents", label: "Documents", icon: FileText },
    { to: "/app/insights", label: "AI Insights", icon: Lightbulb },
    { to: "/admin/ai-monitoring", label: "Analytics", icon: BarChart3 },
    { to: "/admin/audit-logs", label: "System", icon: ClipboardList },
  ],
};

export const homePath = (role: AuthUser["role"] | undefined): string =>
  normalizeRole(role) === "ADMIN" ? "/admin/overview" : "/app/dashboard";
