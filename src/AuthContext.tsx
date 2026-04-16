import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type AuthContextValue = {
  isAuthenticated: boolean;
  token: string | null;
  user: {username: string} | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
};

const AUTH_KEY = 'jr_admin_logged_in';
const TOKEN_KEY = 'jr_admin_token';
const USER_KEY = 'jr_admin_user';
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => localStorage.getItem(AUTH_KEY) === 'true');
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<{username: string} | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    localStorage.setItem(AUTH_KEY, isAuthenticated ? 'true' : 'false');
  }, [isAuthenticated]);

  useEffect(() => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated,
    token,
    user,
    login: async (username: string, password: string) => {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password })
        });

        if (!response.ok) {
          console.error('Login failed:', response.status);
          return false;
        }

        const data = await response.json();
        if (data.token) {
          setToken(data.token);
          setUser({ username: data.user.username });
          setIsAuthenticated(true);
          return true;
        }
        return false;
      } catch (err) {
        console.error('Login error:', err);
        return false;
      }
    },
    logout: () => {
      setIsAuthenticated(false);
      setToken(null);
      setUser(null);
    },
  }), [isAuthenticated, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
