import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";

export default function ProtectedRoute() {
  const { t } = useTranslation();
  const { isAuthenticated, isBootstrapping } =
    useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="auth-hint">{t("Checking session...")}</p>
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
