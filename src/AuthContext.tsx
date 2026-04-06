import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type AuthContextValue = {
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
};

const AUTH_KEY = 'jr_admin_logged_in';
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => localStorage.getItem(AUTH_KEY) === 'true');

  useEffect(() => {
    localStorage.setItem(AUTH_KEY, isAuthenticated ? 'true' : 'false');
  }, [isAuthenticated]);

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated,
    login: (username: string, password: string) => {
      const ok = username.trim() === 'admin' && password === 'admin123';
      setIsAuthenticated(ok);
      return ok;
    },
    logout: () => setIsAuthenticated(false),
  }), [isAuthenticated]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
