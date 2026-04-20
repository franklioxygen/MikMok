import { createContext, startTransition, useContext, useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";

type AuthStatus = {
  authEnabled: boolean;
  authenticated: boolean;
  sessionExpiresAt: number | null;
};

type AuthContextValue = AuthStatus & {
  loading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthStatus>({
    authEnabled: true,
    authenticated: false,
    sessionExpiresAt: null
  });
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const nextStatus = await apiRequest<AuthStatus>("/auth/status");
      setState(nextStatus);
    } catch {
      setState({
        authEnabled: true,
        authenticated: false,
        sessionExpiresAt: null
      });
    } finally {
      setLoading(false);
    }
  }

  async function login(password: string) {
    const nextStatus = await apiRequest<AuthStatus>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });

    setState(nextStatus);
    setLoading(false);
  }

  async function logout() {
    const nextStatus = await apiRequest<AuthStatus>("/auth/logout", {
      method: "POST"
    });

    setState(nextStatus);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        loading,
        login,
        logout,
        refresh
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}

export function useLoginRedirect() {
  const navigate = useNavigate();

  return function redirectToFeed() {
    startTransition(() => {
      navigate("/feed", { replace: true });
    });
  };
}
