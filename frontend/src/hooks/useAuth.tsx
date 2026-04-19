import { createContext, startTransition, useContext } from "react";
import type { PropsWithChildren } from "react";
import { useNavigate } from "react-router-dom";

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

const authDisabledValue: AuthContextValue = {
  authEnabled: false,
  authenticated: true,
  loading: false,
  sessionExpiresAt: null,
  login: async () => undefined,
  logout: async () => undefined,
  refresh: async () => undefined
};

export function AuthProvider({ children }: PropsWithChildren) {
  return <AuthContext.Provider value={authDisabledValue}>{children}</AuthContext.Provider>;
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
