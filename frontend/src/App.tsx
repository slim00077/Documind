import AnimatedBackground from "./components/dashboard/AnimatedBackground";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import AdminRoute from "./components/auth/AdminRoute";
import { ToastProvider } from "./components/ui/ToastProvider";
import DashboardPage from "./pages/DashboardPage";
import DocumentsPage from "./pages/DocumentsPage";
import DocumentDetailPage from "./pages/DocumentDetailPage";
import AssistantPage from "./pages/AssistantPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import WelcomePage from "./pages/WelcomePage";
import MainAppLayout from "./layouts/MainAppLayout";
import AdminLayout from "./layouts/AdminLayout";
import AdminOverviewPage from "./pages/admin/AdminOverviewPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminAuditLogsPage from "./pages/admin/AdminAuditLogsPage";
import AdminDocumentsPage from "./pages/admin/AdminDocumentsPage";
import AdminAiMonitoringPage from "./pages/admin/AdminAiMonitoringPage";
import "./App.css";

function App() {
  return (
    <div className="app">
      <AnimatedBackground />
      <div className="app-content">
        <ToastProvider>
          <Routes>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/app" element={<MainAppLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="documents" element={<DocumentsPage />} />
                <Route path="documents/:id" element={<DocumentDetailPage />} />
                <Route path="assistant" element={<AssistantPage />} />
                <Route path="categories" element={<Navigate to="/app/documents?tab=categories" replace />} />
                <Route path="search" element={<Navigate to="/app/documents?tab=search" replace />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="overview" replace />} />
                  <Route path="overview" element={<AdminOverviewPage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="documents" element={<AdminDocumentsPage />} />
                  <Route path="ai-monitoring" element={<AdminAiMonitoringPage />} />
                  <Route path="audit-logs" element={<AdminAuditLogsPage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </div>
    </div>
  );
}

export default App;
