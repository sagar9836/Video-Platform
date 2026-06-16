import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ensureGuestSession, isGuestSessionExpired } from "../auth/guestSession";

export default function PublicVideoRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user) {
    return children;
  }

  ensureGuestSession();

  if (isGuestSessionExpired()) {
    return <Navigate to="/login" replace state={{ guestExpired: true }} />;
  }

  return children;
}
