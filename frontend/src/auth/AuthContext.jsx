import { createContext, useContext, useEffect, useState } from "react";
import { fetchUserProfile } from "../api/user.api";
import { clearGuestSession } from "./guestSession";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      return null;
    }

    const data = await fetchUserProfile();
    setUser(data);
    return data;
  };

  useEffect(() => {
    const token = localStorage.getItem("token");

    // 🔑 No token → logged out state
    if (!token) {
      setLoading(false);
      return;
    }

    const init = async () => {
      try {
        await refreshUser();
      } catch (err) {
        console.warn("Auth init failed, clearing token");
        localStorage.removeItem("token");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const login = (token) => {
    localStorage.setItem("token", token);
    clearGuestSession();

    // ❌ DO NOT navigate manually here
    // ❌ DO NOT reload conditionally

    window.location.replace("/");
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    window.location.replace("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
