import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function ProtectedRoute() {
  const { isAuthenticated, isBootstrapping } =
    useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="auth-hint">Checking session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ from: location }}
        replace
      />
    );
  }

  return <Outlet />;
}
