import axios, { InternalAxiosRequestConfig, AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://mailprotocol.cbncloud.net/api/v1';

const api = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } });

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = [];

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') : null;
  if (token && config.headers) { config.headers.Authorization = `Bearer ${token}`; }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = (function convertKeys(obj: any): any {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(convertKeys);
        if (typeof obj !== 'object' || obj instanceof Date) return obj;
        return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), convertKeys(v)]));
      })(response.data);
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => { failedQueue.push({ resolve, reject }); }).then((token) => {
          if (originalRequest.headers) originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const refreshToken = localStorage.getItem('cmp_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        localStorage.setItem('cmp_access_token', data.accessToken);
        localStorage.setItem('cmp_refresh_token', data.refreshToken);
        failedQueue.forEach(p => p.resolve(data.accessToken));
        failedQueue = [];
        if (originalRequest.headers) originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (e) {
        failedQueue.forEach(p => p.reject(e));
        failedQueue = [];
        localStorage.removeItem('cmp_access_token');
        localStorage.removeItem('cmp_refresh_token');
        window.location.href = '/login';
        return Promise.reject(e);
      } finally { isRefreshing = false; }
    }
    return Promise.reject(error);
  }
);

export interface AuthResponse { accessToken: string; refreshToken: string; user: User; }
export interface User { id: string; name: string; slug: string; email: string; plan: string; logoPath: string | null; primaryColor: string; secondaryColor: string; accentColor: string; customDomain: string | null; apiKey: string; isActive: boolean; createdAt: string; isAdmin?: boolean; }
export interface Domain { id: string; domainName: string; isVerified: boolean; dkimSelector: string; dkimPublicKey: string | null; spfRecord: string | null; dmarcRecord: string | null; mxRecord: string | null; isActive: boolean; emailCount: number; spamBlocked: number; createdAt: string; approvalRequired?: boolean; }
export interface DomainHealth { domain: string; mxStatus: string; spfStatus: string; dkimStatus: string; dmarcStatus: string; }
export interface FilterRule { id: string; domainId: string; tenantId: string; ruleType: string; matchType: string; pattern: string; action: string; priority: number; isActive: boolean; description: string; }
export interface TrafficStats { period: string; totalIncoming: number; totalOutgoing: number; totalSpam: number; totalVirus: number; byDomain: Array<{ domain: string; incoming: number; outgoing: number; spam: number; virus: number }>; byHour: Array<{ hour: number; count: number }>; }

export const cmpApi = {
  auth: {
    login: (email: string, password: string) => api.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data),
    register: (data: any) => api.post<AuthResponse>('/auth/register', data).then((r) => r.data),
    refresh: (refreshToken: string) => api.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', { refreshToken }).then((r) => r.data),
    me: () => api.get<User>('/auth/me').then((r) => r.data),
  },
  domains: {
    list: () => api.get<Domain[]>('/domains').then((r) => r.data),
    get: (id: string) => api.get<Domain>(`/domains/${id}`).then((r) => r.data),
    create: (domainName: string) => api.post<Domain>('/domains', { domainName }).then((r) => r.data),
    verify: (id: string) => api.post<Domain>(`/domains/${id}/verify`).then((r) => r.data),
    dnsCheck: (id: string) => api.get(`/domains/${id}/dns-check`).then((r) => r.data),
    setupCheck: (id: string) => api.get(`/domains/${id}/setup-check`).then((r) => r.data),
    delete: (id: string) => api.delete(`/domains/${id}`).then((r) => r.data),
    getApproval: (id: string) => api.get('/policy/domain/' + id + '/approval').then((r) => r.data),
    setApproval: (id: string, enabled: boolean) => api.put('/policy/domain/' + id + '/approval', { enabled }).then((r) => r.data),
    getAttachmentPassword: (id: string) => api.get('/policy/domain/' + id + '/attachment-password').then((r) => r.data),
    setAttachmentPassword: (id: string, enabled: boolean) => api.put('/policy/domain/' + id + '/attachment-password', { enabled }).then((r) => r.data),
    getSpamThreshold: (id: string) => api.get('/policy/domain/' + id + '/spam-threshold').then((r) => r.data),
    setSpamThreshold: (id: string, value: number | null) => api.put('/policy/domain/' + id + '/spam-threshold', { value }).then((r) => r.data),
  },
  filters: {
    list: (domainId?: string) => api.get<FilterRule[]>('/filters', { params: domainId ? { domainId } : {} }).then((r) => r.data),
    create: (data: any) => api.post<FilterRule>('/filters', data).then((r) => r.data),
    update: (id: string, data: any) => api.put<FilterRule>(`/filters/${id}`, data).then((r) => r.data),
    delete: (id: string) => api.delete(`/filters/${id}`).then((r) => r.data),
  },
  quarantine: {
    list: (params?: any) => api.get('/quarantine', { params }).then((r) => r.data),
    release: (id: string) => api.post(`/quarantine/${id}/release`).then((r) => r.data),
    delete: (id: string) => api.delete(`/quarantine/${id}`).then((r) => r.data),
    bulk: (action: string, ids: string[]) => api.post('/quarantine/bulk', { action, ids }).then((r) => r.data),
    stats: () => api.get('/quarantine/stats').then((r) => r.data),
  },
  reports: {
    traffic: (params?: any) => api.get<TrafficStats>('/reports/traffic', { params }).then((r) => r.data),
    spam: (params?: any) => api.get('/reports/spam', { params }).then((r) => r.data),
    topSenders: (params?: any) => api.get('/reports/top-senders', { params }).then((r) => r.data),
    domainHealth: () => api.get<DomainHealth[]>('/reports/domain-health').then((r) => r.data),
    export: (params?: any) => api.get('/reports/export', { params, responseType: 'blob' }).then((r) => r.data),
  },
  tenants: {
    list: () => api.get('/admin/tenants').then((r) => r.data),
    update: (id: string, data: any) => api.put(`/admin/tenants/${id}`, data).then((r) => r.data),
    branding: (id: string, data: FormData) => api.put(`/admin/tenants/${id}/branding`, data, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  },
  queue: {
    list: () => api.get('/queue').then((r) => r.data),
    stats: () => api.get('/queue/stats').then((r) => r.data),
    detail: (id: string) => api.get(`/queue/${id}`).then((r) => r.data),
    headers: (id: string) => api.get(`/queue/${id}/headers`).then((r) => r.data),
    flush: () => api.post('/queue/flush').then((r) => r.data),
    flushOne: (id: string) => api.post(`/queue/${id}/flush`).then((r) => r.data),
    hold: (id: string) => api.post(`/queue/${id}/hold`).then((r) => r.data),
    release: (id: string) => api.post(`/queue/${id}/release`).then((r) => r.data),
    deleteOne: (id: string) => api.delete(`/queue/${id}`).then((r) => r.data),
    deleteAll: () => api.delete('/queue').then((r) => r.data),
  },
  relay: {
    config: () => api.get('/relay').then((r) => r.data),
    update: (data: any) => api.put('/relay', data).then((r) => r.data),
    addDomain: (data: any) => api.post('/relay/domain', data).then((r) => r.data),
    removeDomain: (domain: string) => api.delete('/relay/domain/' + domain).then((r) => r.data),
    test: (data: any) => api.post('/relay/test', data).then((r) => r.data),
    logs: () => api.get('/relay/logs').then((r) => r.data),
  },
  trustedHosts: {
    list: () => api.get('/trusted-hosts').then((r) => r.data),
    stats: () => api.get('/trusted-hosts/stats').then((r) => r.data),
    add: (data: any) => api.post('/trusted-hosts', data).then((r) => r.data),
    remove: (address: string) => api.delete('/trusted-hosts/' + encodeURIComponent(address)).then((r) => r.data),
    toggle: (address: string, enabled: boolean) => api.put('/trusted-hosts/' + encodeURIComponent(address) + '/toggle', { enabled }).then((r) => r.data),
    test: (address: string, port: number = 25) => api.post('/trusted-hosts/test', { address, port }).then((r) => r.data),
  },
  gateway: {
    config: () => api.get('/gateway/config').then((r) => r.data),
    updateConfig: (data: any) => api.put('/gateway/config', data).then((r) => r.data),
    trustedHosts: () => api.get('/gateway/trusted-hosts').then((r) => r.data),
    addTrustedHost: (data: any) => api.post('/gateway/trusted-hosts', data).then((r) => r.data),
    removeTrustedHost: (address: string) => api.delete('/gateway/trusted-hosts/' + encodeURIComponent(address)).then((r) => r.data),
    apiKeys: () => api.get('/gateway/api-keys').then((r) => r.data),
    createApiKey: (data: any) => api.post('/gateway/api-keys', data).then((r) => r.data),
    revokeApiKey: (id: string) => api.delete('/gateway/api-keys/' + id).then((r) => r.data),
    rateLimits: () => api.get('/gateway/rate-limits').then((r) => r.data),
    updateRateLimits: (data: any) => api.put('/gateway/rate-limits', data).then((r) => r.data),
  },
  smtpAuth: {
    credentials: () => api.get('/smtp-auth/credentials').then((r) => r.data),
    createCredential: (data: any) => api.post('/smtp-auth/credentials', data).then((r) => r.data),
    deleteCredential: (id: string) => api.delete('/smtp-auth/credentials/' + id).then((r) => r.data),
    toggleCredential: (id: string, enabled: boolean) => api.put('/smtp-auth/credentials/' + id + '/toggle', { enabled }).then((r) => r.data),
    verify: (data: any) => api.post('/smtp-auth/verify', data).then((r) => r.data),
    instructions: (id: string) => api.get('/smtp-auth/instructions/' + id).then((r) => r.data),
  },
  emailLogs: {
    list: (params?: any) => api.get('/email-logs', { params }).then((r) => r.data),
    stats: (params?: any) => api.get('/email-logs/stats', { params }).then((r) => r.data),
    sync: () => api.post('/email-logs/sync').then((r) => r.data),
    init: () => api.post('/email-logs/init').then((r) => r.data),
    export: (params?: any) => api.get('/email-logs/export', { params, responseType: 'blob' }).then((r) => r.data),
  },
  accessLists: {
    list: (params?: any) => api.get('/access-lists', { params }).then((r) => r.data),
    stats: () => api.get('/access-lists/stats').then((r) => r.data),
    add: (data: any) => api.post('/access-lists', data).then((r) => r.data),
    remove: (id: number) => api.delete('/access-lists/' + id).then((r) => r.data),
    toggle: (id: number, enabled: boolean) => api.put('/access-lists/' + id + '/toggle', { enabled }).then((r) => r.data),
    sync: () => api.post('/access-lists/sync').then((r) => r.data),
  },
  audit: {
    list: (params?: any) => api.get('/audit', { params }).then((r) => r.data),
  },
  alerts: {
    list: () => api.get('/alerts').then((r) => r.data),
    events: () => api.get('/alerts/events').then((r) => r.data),
    add: (data: any) => api.post('/alerts', data).then((r) => r.data),
    remove: (id: string) => api.delete('/alerts/' + id).then((r) => r.data),
    toggle: (id: string, enabled: boolean) => api.put('/alerts/' + id + '/toggle', { enabled }).then((r) => r.data),
  },
  webhooks: {
    list: () => api.get('/webhooks').then((r) => r.data),
    events: () => api.get('/webhooks/events').then((r) => r.data),
    add: (data: any) => api.post('/webhooks', data).then((r) => r.data),
    remove: (id: string) => api.delete('/webhooks/' + id).then((r) => r.data),
    test: (id: string) => api.post('/webhooks/' + id + '/test').then((r) => r.data),
  },
  scheduledReports: {
    list: () => api.get('/scheduled-reports').then((r) => r.data),
    add: (data: any) => api.post('/scheduled-reports', data).then((r) => r.data),
    remove: (id: string) => api.delete('/scheduled-reports/' + id).then((r) => r.data),
    test: (id: string) => api.post('/scheduled-reports/' + id + '/test').then((r) => r.data),
  },
};

export default api;