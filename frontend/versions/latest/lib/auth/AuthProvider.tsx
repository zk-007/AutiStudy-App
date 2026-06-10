"use client";

/**
 * AuthProvider — React context that owns:
 *   - the current user (or null when logged out)
 *   - the bearer token (persisted in localStorage)
 *   - login / register / logout actions
 *   - an isLoading flag while we restore session on first mount
 *
 * Wraps the entire app inside `app/layout.tsx` so any component can call
 * `useAuth()` to read user state or trigger an auth flow.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, authApi, getToken, setToken, type User } from "@/lib/api/client";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    grade: number;
    role?: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Start as loading so route guards don't flash redirects before we know
  // whether the persisted token is still valid.
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // ── On first mount: if a token is in localStorage, validate it. ──────────
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await authApi.me();
        if (!cancelled) setUser(me);
      } catch (err) {
        // Token is invalid/expired or backend is unreachable — clear it
        // silently. The user will land on /login when they hit a guarded page.
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
        }
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback<AuthContextValue["login"]>(async (email, password) => {
    const res = await authApi.login({ email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback<AuthContextValue["register"]>(async (data) => {
    const res = await authApi.register(data);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback<AuthContextValue["logout"]>(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore — even if the server can't be reached, we still want to
      // log the user out locally.
    }
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback<AuthContextValue["refresh"]>(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      setUser(null);
      setToken(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refresh,
    }),
    [user, isLoading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
