import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function AdminRoute() {
  const { user } = useAuth();

  if (user?.role !== "ADMIN") {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <Outlet />;
}
