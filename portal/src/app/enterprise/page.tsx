'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  Shield, RefreshCw, Loader2, Plus, Trash2, Copy, CheckCircle, XCircle,
  RotateCw, Download, Key, Archive, FileCheck, AlertTriangle, Building2
} from 'lucide-react';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://mailprotocol.cbncloud.net/api/v1';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') : '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_URL}/enterprise${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── camelCase conversion (matches axios interceptor behaviour) ───────────────
function toCamel(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamel);
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      toCamel(v),
    ])
  );
}

async function apiFetchC(path: string, opts: RequestInit = {}) {
  return toCamel(await apiFetch(path, opts));
}

const TABS = [
  { id: 'dlp', label: 'DLP Rules', icon: Shield },
  { id: 'dkim', label: 'DKIM Rotation', icon: Key },
  { id: 'archiving', label: 'Email Archiving', icon: Archive },
  { id: 'compliance', label: 'Compliance', icon: FileCheck },
];

// ─── DLP ──────────────────────────────────────────────────────────────────────
function DLPTab() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', pattern: '', action: 'block', description: '' });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['enterprise-dlp'],
    queryFn: () => apiFetchC('/dlp'),
  } as any);

  const addMutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch('/dlp', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast.success('Rule added');
      qc.invalidateQueries({ queryKey: ['enterprise-dlp'] });
      setShowAdd(false);
      setForm({ name: '', pattern: '', action: 'block', description: '' });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/dlp/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Rule deleted'); qc.invalidateQueries({ queryKey: ['enterprise-dlp'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiFetch('/dlp/sync', { method: 'POST' }),
    onSuccess: (d: any) => toast.success(`Synced ${d.synced} rule(s) to Rspamd`),
    onError: (e: any) => toast.error(e.message),
  });

  const actionColors: Record<string, string> = {
    block: 'text-red-700 bg-red-50 border-red-200',
    quarantine: 'text-orange-700 bg-orange-50 border-orange-200',
    tag: 'text-blue-700 bg-blue-50 border-blue-200',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Regex-based content scanning rules applied at SMTP time via Rspamd.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Sync to Rspamd
          </Button>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}><Plus className="w-4 h-4 mr-1" />Add Rule</Button>
        </div>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Rule Name</label>
              <Input placeholder="Credit Card Numbers" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Action</label>
              <select
                className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                value={form.action}
                onChange={e => setForm({ ...form, action: e.target.value })}
              >
                <option value="block">Block</option>
                <option value="quarantine">Quarantine</option>
                <option value="tag">Tag</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Regex Pattern</label>
              <Input placeholder="\b4[0-9]{12}(?:[0-9]{3})?\b" value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })} className="font-mono text-xs" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Description</label>
              <Input placeholder="Matches Visa credit card numbers" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" disabled={!form.name || !form.pattern || addMutation.isPending}
              onClick={() => addMutation.mutate(form)}>
              {addMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}Save Rule
            </Button>
          </div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (rules as any[]).length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No DLP rules configured yet.</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(rules as any[]).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.pattern}</code></TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${actionColors[r.action] || ''}`}>
                      {r.action}
                    </span>
                  </TableCell>
                  <TableCell>
                    {r.enabled !== false
                      ? <Badge variant="success">Active</Badge>
                      : <Badge variant="outline">Disabled</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-red-600"
                      onClick={() => deleteMutation.mutate(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}

// ─── DKIM ─────────────────────────────────────────────────────────────────────
function DKIMTab() {
  const qc = useQueryClient();
  const [newDnsRecord, setNewDnsRecord] = useState<Record<string, any>>({});

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['enterprise-dkim'],
    queryFn: () => apiFetchC('/dkim-rotation'),
  });

  const rotateMutation = useMutation({
    mutationFn: (domainId: string) =>
      apiFetchC(`/dkim-rotation/${domainId}`, { method: 'POST' }),
    onSuccess: (data: any) => {
      toast.success('New DKIM key generated — add the DNS record below');
      setNewDnsRecord(prev => ({ ...prev, [data.domain]: data }));
      qc.invalidateQueries({ queryKey: ['enterprise-dkim'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Dual-key DKIM rotation: a new key is generated and staged. Add the DNS record, then the old key is retired after 7 days.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (domains as any[]).length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-gray-400">No domains found.</CardContent></Card>
      ) : (
        (domains as any[]).map((d: any) => (
          <Card key={d.domain}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{d.domain}</CardTitle>
                <Button size="sm" variant="outline"
                  disabled={rotateMutation.isPending}
                  onClick={() => rotateMutation.mutate(d.domainId)}>
                  {rotateMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    : <RotateCw className="w-4 h-4 mr-1" />}
                  Rotate Key
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Active Selector</p>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                    {d.selector || '—'}
                  </code>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Created</p>
                  <p className="text-xs text-gray-700">{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—'}</p>
                </div>
                {d.pendingSelector && (
                  <>
                    <div>
                      <p className="text-xs text-orange-600 mb-0.5 font-medium">⏳ Pending Selector</p>
                      <code className="text-xs bg-orange-50 px-2 py-1 rounded block border border-orange-200">
                        {d.pendingSelector}
                      </code>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Pending Created</p>
                      <p className="text-xs text-gray-700">{d.pendingCreatedAt ? new Date(d.pendingCreatedAt).toLocaleDateString() : '—'}</p>
                    </div>
                  </>
                )}
              </div>

              {newDnsRecord[d.domain] && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md space-y-2">
                  <p className="text-xs font-semibold text-blue-800">Add this DNS TXT record:</p>
                  <p className="text-xs text-blue-700 font-mono">{newDnsRecord[d.domain].dnsName}</p>
                  <div className="relative">
                    <pre className="text-xs bg-white border border-blue-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                      {newDnsRecord[d.domain].dnsRecord}
                    </pre>
                    <button
                      className="absolute top-1 right-1 p-1 text-blue-500 hover:text-blue-700"
                      onClick={() => { navigator.clipboard.writeText(newDnsRecord[d.domain].dnsRecord); toast.success('Copied!'); }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-blue-600">{newDnsRecord[d.domain].transitionNote}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── Archiving ────────────────────────────────────────────────────────────────
function ArchivingTab() {
  const qc = useQueryClient();
  const [localCfg, setLocalCfg] = useState<any>(null);
  const [dirty, setDirty] = useState(false);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['enterprise-archiving'],
    queryFn: () => apiFetchC('/archiving'),
    onSuccess: (d: any) => { if (!dirty) setLocalCfg(d); },
  } as any);

  const current = localCfg ?? cfg ?? {};

  const updateMutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch('/archiving', { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast.success('Archiving config saved');
      qc.invalidateQueries({ queryKey: ['enterprise-archiving'] });
      setDirty(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function update(patch: Partial<typeof current>) {
    setLocalCfg((prev: any) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <>
          <Card><CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Enable Email Archiving</p>
                <p className="text-xs text-gray-500">Store a copy of all inbound and outbound messages</p>
              </div>
              <Switch
                checked={!!current.enabled}
                onCheckedChange={v => update({ enabled: v })}
              />
            </div>

            <div className={current.enabled ? '' : 'opacity-40 pointer-events-none'}>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-900 block mb-1">
                    Retention Period: <span className="text-primary-600">{current.retentionDays ?? 365} days</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">How long to keep archived emails (30 – 3650 days)</p>
                  <input
                    type="range"
                    min={30}
                    max={3650}
                    step={30}
                    value={current.retentionDays ?? 365}
                    onChange={e => update({ retentionDays: parseInt(e.target.value) })}
                    className="w-full accent-primary-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>30 days</span>
                    <span>1 year</span>
                    <span>5 years</span>
                    <span>10 years</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Include Attachments</p>
                    <p className="text-xs text-gray-500">Archive email attachments alongside message bodies</p>
                  </div>
                  <Switch
                    checked={!!current.includeAttachments}
                    onCheckedChange={v => update({ includeAttachments: v })}
                  />
                </div>
              </div>
            </div>
          </CardContent></Card>

          {current.storageUsedMb !== undefined && (
            <Card><CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">Archive Storage Used</p>
              <p className="text-2xl font-bold text-gray-900">
                {current.storageUsedMb >= 1024
                  ? `${(current.storageUsedMb / 1024).toFixed(1)} GB`
                  : `${current.storageUsedMb} MB`}
              </p>
              <p className="text-xs text-gray-500">{current.archivePath || '/var/cmp/archive'}</p>
            </CardContent></Card>
          )}

          <div className="flex justify-end">
            <Button
              disabled={!dirty || updateMutation.isPending}
              onClick={() => updateMutation.mutate({
                enabled: current.enabled,
                retention_days: current.retentionDays,
                include_attachments: current.includeAttachments,
              })}
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Save Changes
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Compliance ───────────────────────────────────────────────────────────────
function ComplianceTab() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['enterprise-compliance'],
    queryFn: () => apiFetchC('/compliance'),
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      apiFetch('/compliance/export', { method: 'POST', body: JSON.stringify({ format: 'json' }) }),
    onSuccess: (d: any) => {
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-report-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    },
    onError: (e: any) => toast.error(e.message),
  });

  function CheckList({ title, checks, passed, total, status }: any) {
    const allPass = status === 'compliant';
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{title}</CardTitle>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
              allPass
                ? 'text-green-700 bg-green-50 border-green-200'
                : 'text-orange-700 bg-orange-50 border-orange-200'
            }`}>
              {passed}/{total} {allPass ? '✓ Compliant' : 'Partial'}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {checks?.map((c: any) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                {c.passed
                  ? <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  : <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />}
                <div>
                  <p className={c.passed ? 'text-gray-800' : 'text-gray-600'}>{c.label}</p>
                  <p className="text-xs text-gray-400">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Live compliance status based on your current gateway configuration.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" />Refresh
          </Button>
          <Button size="sm" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
            {exportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
            Export Report
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CheckList title="GDPR" {...data.gdpr} />
          <CheckList title="HIPAA" {...data.hipaa} />
        </div>
      ) : null}

      {data && (
        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-2 text-xs text-gray-500">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p>
                Compliance checks are automated indicators based on gateway configuration.
                Full regulatory compliance requires legal review and may involve additional controls outside this system.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EnterprisePage() {
  const [activeTab, setActiveTab] = useState('dlp');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary-600" />
            Enterprise Features
          </h2>
          <p className="text-sm text-gray-500">DLP, DKIM rotation, archiving and compliance</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'dlp' && <DLPTab />}
      {activeTab === 'dkim' && <DKIMTab />}
      {activeTab === 'archiving' && <ArchivingTab />}
      {activeTab === 'compliance' && <ComplianceTab />}
    </div>
  );
}
