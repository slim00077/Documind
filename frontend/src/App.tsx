import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import RoleRoute from "./components/auth/RoleRoute";
import AppShell from "./components/layout/AppShell";
import { ToastProvider } from "./components/ui/ToastProvider";
import { useAuth } from "./context/AuthContext";
import { normalizeRole } from "./config/roles";
import DocumentsPage from "./pages/DocumentsPage";
import DocumentDetailPage from "./pages/DocumentDetailPage";
import AssistantPage from "./pages/AssistantPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import WelcomePage from "./pages/WelcomePage";
import LegalPage from "./pages/LegalPage";
import InsightsPage from "./pages/InsightsPage";
import StudentDashboard from "./pages/dashboards/StudentDashboard";
import TeacherDashboard from "./pages/dashboards/TeacherDashboard";
import { AiToolsPage, ComparePage, SearchPage, StudyToolsPage } from "./pages/ToolPages";
import AdminOverviewPage from "./pages/admin/AdminOverviewPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminAuditLogsPage from "./pages/admin/AdminAuditLogsPage";
import AdminDocumentsPage from "./pages/admin/AdminDocumentsPage";
import AdminAiMonitoringPage from "./pages/admin/AdminAiMonitoringPage";
import AdminOrganizationsPage from "./pages/admin/AdminOrganizationsPage";
import OrgLayout from "./pages/org/OrgLayout";
import OrgDashboardPage from "./pages/org/OrgDashboardPage";
import OrgSettingsPage from "./pages/org/OrgSettingsPage";
import OrgPeoplePage from "./pages/org/OrgPeoplePage";
import OrgGroupsPage from "./pages/org/OrgGroupsPage";
import GroupDetailPage from "./pages/org/GroupDetailPage";
import OrgInvitationsPage from "./pages/org/OrgInvitationsPage";
import OrgAnalyticsPage from "./pages/org/OrgAnalyticsPage";
import { DiscoverGroupsPage, RequestsPage } from "./pages/org/RequestsAndDiscoverPages";
import NotificationsPage from "./pages/NotificationsPage";
import JoinOrganizationPage from "./pages/JoinOrganizationPage";
import InviteAcceptPage from "./pages/InviteAcceptPage";
import OnboardingPage from "./pages/OnboardingPage";

function RoleDashboard() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  if (role === "ADMIN") return <Navigate to="/admin/overview" replace />;
  return role === "TEACHER" ? <TeacherDashboard /> : <StudentDashboard />;
}

function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<AppShell />}>
            <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
            <Route path="/app/dashboard" element={<RoleDashboard />} />
            <Route path="/app/documents" element={<DocumentsPage />} />
            <Route path="/app/documents/:id" element={<DocumentDetailPage />} />
            <Route path="/app/assistant" element={<AssistantPage />} />
            <Route path="/app/search" element={<SearchPage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
            <Route path="/app/join" element={<JoinOrganizationPage />} />
            <Route path="/app/notifications" element={<NotificationsPage />} />
            <Route path="/app/compare" element={<ComparePage />} />
            <Route path="/app/insights" element={<InsightsPage />} />
            <Route path="/app/categories" element={<Navigate to="/app/documents?tab=categories" replace />} />
            <Route path="/org/:orgId" element={<OrgLayout />}>
              <Route index element={<OrgDashboardPage />} />
              <Route path="groups" element={<OrgGroupsPage />} />
              <Route path="groups/:groupId" element={<GroupDetailPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route element={<OrgLayout allow={["ADMIN", "TEACHER", "STUDENT"]} />}>
                <Route path="settings" element={<OrgSettingsPage />} />
              </Route>
              <Route element={<OrgLayout allow={["ADMIN", "TEACHER"]} />}>
                <Route path="students" element={<OrgPeoplePage kind="STUDENT" />} />
                <Route path="requests" element={<RequestsPage />} />
                <Route path="invitations" element={<OrgInvitationsPage />} />
              </Route>
              <Route element={<OrgLayout allow={["ADMIN"]} />}>
                <Route path="teachers" element={<OrgPeoplePage kind="TEACHER" />} />
                <Route path="analytics" element={<OrgAnalyticsPage />} />
              </Route>
              <Route element={<OrgLayout allow={["STUDENT"]} />}>
                <Route path="discover" element={<DiscoverGroupsPage />} />
              </Route>
            </Route>
            <Route element={<RoleRoute allow={["STUDENT"]} />}>
              <Route path="/app/study" element={<StudyToolsPage />} />
            </Route>
            <Route element={<RoleRoute allow={["TEACHER"]} />}>
              <Route path="/app/ai-tools" element={<AiToolsPage />} />
            </Route>
            <Route element={<RoleRoute allow={["ADMIN"]} />}>
              <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
              <Route path="/admin/overview" element={<AdminOverviewPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/organizations" element={<AdminOrganizationsPage />} />
              <Route path="/admin/documents" element={<AdminDocumentsPage />} />
              <Route path="/admin/ai-monitoring" element={<AdminAiMonitoringPage />} />
              <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}

export default App;
