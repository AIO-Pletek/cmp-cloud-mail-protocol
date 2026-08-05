import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Tenant, Domain, FilterRule, QuarantineItem, QuarantineStats, TrafficStats, DomainHealth } from '@/types';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: unknown) => void; reject: (reason?: unknown) => void }> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') : null;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const refreshToken = localStorage.getItem('cmp_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'}/auth/refresh`,
          { refreshToken }
        );
        localStorage.setItem('cmp_access_token', data.accessToken);
        localStorage.setItem('cmp_refresh_token', data.refreshToken);
        processQueue(null, data.accessToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError);
        localStorage.removeItem('cmp_access_token');
        localStorage.removeItem('cmp_refresh_token');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; role: string; tenantId: string };
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

export const cmpApi = {
  auth: {
    login: (email: string, password: string) =>
      api.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data),
    register: (data: { name: string; email: string; password: string; companyName: string }) =>
      api.post<AuthResponse>('/auth/register', data).then((r) => r.data),
    refresh: (refreshToken: string) =>
      api.post<AuthResponse>('/auth/refresh', { refreshToken }).then((r) => r.data),
    me: () => api.get<User>('/auth/me').then((r) => r.data),
  },
  domains: {
    list: () => api.get<Domain[]>('/domains').then((r) => r.data),
    create: (domainName: string) => api.post<Domain>('/domains', { domainName }).then((r) => r.data),
    verify: (id: string) => api.post<Domain>(`/domains/${id}/verify`).then((r) => r.data),
    dnsCheck: (id: string) => api.get<Domain>(`/domains/${id}/dns-check`).then((r) => r.data),
    delete: (id: string) => api.delete(`/domains/${id}`).then((r) => r.data),
  },
  filters: {
    list: (domainId?: string) =>
      api.get<FilterRule[]>('/filters', { params: domainId ? { domainId } : {} }).then((r) => r.data),
    create: (data: Partial<FilterRule>) => api.post<FilterRule>('/filters', data).then((r) => r.data),
    update: (id: string, data: Partial<FilterRule>) => api.put<FilterRule>(`/filters/${id}`, data).then((r) => r.data),
    delete: (id: string) => api.delete(`/filters/${id}`).then((r) => r.data),
  },
  quarantine: {
    list: (params?: { domainId?: string; status?: string; search?: string; page?: number; limit?: number }) =>
      api.get<{ items: QuarantineItem[]; total: number }>('/quarantine', { params }).then((r) => r.data),
    release: (id: string) => api.post(`/quarantine/${id}/release`).then((r) => r.data),
    delete: (id: string) => api.delete(`/quarantine/${id}`).then((r) => r.data),
    bulk: (action: 'release' | 'delete', ids: string[]) =>
      api.post('/quarantine/bulk', { action, ids }).then((r) => r.data),
    stats: () => api.get<QuarantineStats>('/quarantine/stats').then((r) => r.data),
  },
  reports: {
    traffic: (params?: { period?: string; domainId?: string }) =>
      api.get<TrafficStats>('/reports/traffic', { params }).then((r) => r.data),
    spam: (params?: { period?: string }) =>
      api.get<{ topSenders: Array<{ sender: string; count: number; percentage: number }>; byDomain: Array<{ domain: string; spam: number; total: number }> }>('/reports/spam', { params }).then((r) => r.data),
    topSenders: (params?: { period?: string; limit?: number }) =>
      api.get<Array<{ sender: string; count: number }>>('/reports/top-senders', { params }).then((r) => r.data),
    domainHealth: () => api.get<DomainHealth[]>('/reports/domain-health').then((r) => r.data),
    export: (params?: { period?: string; format?: string }) =>
      api.get('/reports/export', { params, responseType: 'blob' }).then((r) => r.data),
  },
  tenants: {
    list: () => api.get<Tenant[]>('/admin/tenants').then((r) => r.data),
    update: (id: string, data: Partial<Tenant>) =>
      api.put<Tenant>(`/admin/tenants/${id}`, data).then((r) => r.data),
    branding: (id: string, data: FormData) =>
      api.put<Tenant>(`/admin/tenants/${id}/branding`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data),
  },
};

export default api;
