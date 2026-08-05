'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { cmpApi, User, AuthResponse } from './api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (data: { name: string; email: string; password: string; companyName: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const storeTokens = (data: AuthResponse) => {
    localStorage.setItem('cmp_access_token', data.accessToken);
    localStorage.setItem('cmp_refresh_token', data.refreshToken);
    setUser(data.user);
  };

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('cmp_access_token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const me = await cmpApi.auth.me();
      setUser(me);
    } catch {
      localStorage.removeItem('cmp_access_token');
      localStorage.removeItem('cmp_refresh_token');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    const data = await cmpApi.auth.login(email, password);
    storeTokens(data);
  };

  const register = async (regData: { name: string; email: string; password: string; companyName: string }) => {
    const data = await cmpApi.auth.register(regData);
    storeTokens(data);
  };

  const logout = () => {
    localStorage.removeItem('cmp_access_token');
    localStorage.removeItem('cmp_refresh_token');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
