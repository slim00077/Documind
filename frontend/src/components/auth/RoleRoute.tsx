import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { homePath, normalizeRole, type AppRole } from "../../config/roles";

// Client-side gate for UX; the API enforces the same rules with RolesGuard.
export default function RoleRoute({ allow }: { allow: AppRole[] }) {
  const { user } = useAuth();

  if (!user || !allow.includes(normalizeRole(user.role))) {
    return <Navigate to={user ? homePath(user.role) : "/login"} replace />;
  }

  return <Outlet />;
}
