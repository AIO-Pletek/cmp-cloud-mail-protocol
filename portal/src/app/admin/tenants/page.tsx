'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Loader2, LogIn, Users, Shield, Globe } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') || '' : ''; }
const apiGet = async (url: string) => { const r = await fetch('/api/v1' + url, { headers: { 'Authorization': 'Bearer ' + getToken() } }); return r.json(); };
const apiPost = async (url: string, body: any) => { const r = await fetch('/api/v1' + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }, body: JSON.stringify(body) }); return r.json(); };

export default function TenantsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState('starter');

  const { data: tenantsRaw, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiGet('/tenants'),
  });
  const tenants = Array.isArray(tenantsRaw) ? tenantsRaw : [];

  const createMut = useMutation({
    mutationFn: () => apiPost('/tenants', { name, email, password, plan }),
    onSuccess: (data: any) => {
      toast.success('Tenant created');
      qc.invalidateQueries({ queryKey: ['tenants'] });
      setShowAdd(false);
      setName('');
      setEmail('');
      setPassword('');
    },
    onError: (e: any) => toast.error(e?.detail || 'Failed to create tenant'),
  });

  const impersonateMut = useMutation({
    mutationFn: async (tenantId: string) => {
      const r = await fetch('/api/v1/tenants/' + tenantId + '/impersonate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() },
      });
      return r.json();
    },
    onSuccess: (data: any) => {
      if (data.accessToken) {
        localStorage.setItem('cmp_access_token', data.accessToken);
        localStorage.setItem('cmp_refresh_token', data.refreshToken);
        toast.success('Impersonating: ' + data.user.email);
        router.push('/dashboard');
      } else {
        toast.error(data.detail || 'Impersonate failed');
      }
    },
  });

  const planColors: Record<string, string> = {
    free: 'bg-gray-100 text-gray-700',
    starter: 'bg-blue-100 text-blue-700',
    pro: 'bg-green-100 text-green-700',
    enterprise: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users className="w-6 h-6" /> Tenant Management</h2>
          <p className="text-sm text-gray-500">Create and manage tenant accounts</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}><Plus className="w-4 h-4 mr-1" />{showAdd ? 'Cancel' : 'Create Tenant'}</Button>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Company Name</label><Input placeholder="Acme Corp" value={name} onChange={(e: any) => setName(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Email</label><Input placeholder="admin@acme.com" value={email} onChange={(e: any) => setEmail(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Password</label><Input type="password" placeholder="Password" value={password} onChange={(e: any) => setPassword(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Plan</label>
              <select value={plan} onChange={(e: any) => setPlan(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <Button onClick={() => { if (name && email && password) createMut.mutate(); }} disabled={createMut.isPending || !name || !email || !password}>
              {createMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Create Tenant
            </Button>
          </div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : tenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Users className="w-12 h-12 mb-3 opacity-30" /><p className="text-lg font-medium">No tenants</p><p className="text-sm mt-1">Create a tenant to get started</p>
          </div>
        ) : (
          <Table><TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Plan</TableHead><TableHead>API Key</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader><TableBody>
            {tenants.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.slug}</div>
                </TableCell>
                <TableCell>{t.email}</TableCell>
                <TableCell><span className={`px-2 py-1 text-xs rounded-md ${planColors[t.plan] || 'bg-gray-100'}`}>{t.plan}</span></TableCell>
                <TableCell><code className="text-xs bg-gray-100 px-2 py-1 rounded">{t.apiKey?.substring(0, 20)}...</code></TableCell>
                <TableCell className="text-sm text-gray-500">{t.createdAt ? formatDate(t.createdAt) : '-'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => impersonateMut.mutate(t.id)} disabled={impersonateMut.isPending} title="Login as this tenant">
                      <LogIn className="w-4 h-4 mr-1" /> Impersonate
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        )}
      </CardContent></Card>
    </div>
  );
}