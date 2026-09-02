'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { cmpApi, User, AuthResponse } from './api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isImpersonating: boolean;
  impersonatedBy: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  returnToAdmin: () => void;
  register: (data: { name: string; email: string; password: string; companyName: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedBy, setImpersonatedBy] = useState<string | null>(null);
  const [adminTokens, setAdminTokens] = useState<{ access: string; refresh: string } | null>(null);

  const storeTokens = (data: AuthResponse) => {
    localStorage.setItem('cmp_access_token', data.accessToken);
    localStorage.setItem('cmp_refresh_token', data.refreshToken);
    setUser(data.user);
  };

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('cmp_access_token');
    const impersonating = localStorage.getItem('cmp_impersonating') === 'true';
    const impBy = localStorage.getItem('cmp_impersonated_by');
    const adminAccess = localStorage.getItem('cmp_admin_access_token');
    const adminRefresh = localStorage.getItem('cmp_admin_refresh_token');
    
    if (impersonating) {
      setIsImpersonating(true);
      setImpersonatedBy(impBy);
      if (adminAccess && adminRefresh) {
        setAdminTokens({ access: adminAccess, refresh: adminRefresh });
      }
    }
    
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

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = async (email: string, password: string) => {
    const data = await cmpApi.auth.login(email, password);
    storeTokens(data);
    setIsImpersonating(false);
    setImpersonatedBy(null);
    setAdminTokens(null);
  };

  const impersonate = (data: any, adminAccessToken: string, adminRefreshToken: string) => {
    // Save admin tokens
    setAdminTokens({ access: adminAccessToken, refresh: adminRefreshToken });
    // Set impersonated user
    localStorage.setItem('cmp_access_token', data.accessToken);
    localStorage.setItem('cmp_refresh_token', data.refreshToken);
    setUser(data.user);
    setIsImpersonating(true);
    setImpersonatedBy(data.impersonatedBy || 'admin');
  };

  const returnToAdmin = () => {
    if (adminTokens) {
      localStorage.setItem('cmp_access_token', adminTokens.access);
      localStorage.setItem('cmp_refresh_token', adminTokens.refresh);
      localStorage.removeItem('cmp_impersonating');
      localStorage.removeItem('cmp_impersonated_by');
      localStorage.removeItem('cmp_admin_access_token');
      localStorage.removeItem('cmp_admin_refresh_token');
      setIsImpersonating(false);
      setImpersonatedBy(null);
      setAdminTokens(null);
      window.location.href = '/admin/tenants';
    }
  };

  const register = async (regData: { name: string; email: string; password: string; companyName: string }) => {
    const data = await cmpApi.auth.register(regData);
    storeTokens(data);
  };

  const logout = () => {
    localStorage.removeItem('cmp_access_token');
    localStorage.removeItem('cmp_refresh_token');
    localStorage.removeItem('cmp_impersonating');
    localStorage.removeItem('cmp_impersonated_by');
    localStorage.removeItem('cmp_admin_access_token');
    localStorage.removeItem('cmp_admin_refresh_token');
    setUser(null);
    setIsImpersonating(false);
    setImpersonatedBy(null);
    setAdminTokens(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, isImpersonating, impersonatedBy, login, logout, returnToAdmin, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}