'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Shield, RefreshCw, Loader2, Plus, Trash2, Copy, CheckCircle, XCircle, AlertTriangle, Key, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') || '' : ''; }
const H = () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() });
const BASE = '/api/v1/enterprise';

const apiFetch = async (path: string, opts: RequestInit = {}) => {
  const r = await fetch(BASE + path, { headers: H() as any, ...opts });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || r.statusText);
  }
  return r.json();
};

const TABS = [
  { id: 'dlp', label: 'DLP Rules', icon: Shield },
  { id: 'dkim', label: 'DKIM Rotation', icon: Key },
  { id: 'archiving', label: 'Archiving', icon: Building2 },
  { id: 'compliance', label: 'Compliance', icon: CheckCircle },
];

// ── DLP ──────────────────────────────────────────────────
function DLPTab() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', pattern: '', action: 'tag', description: '' });

  const { data, isLoading } = useQuery({ queryKey: ['dlp'], queryFn: () => apiFetch('/dlp') });
  const systemRules: any[] = data?.system_rules || [];
  const customRules: any[] = data?.custom_rules || [];

  const addMut = useMutation({
    mutationFn: (d: any) => apiFetch('/dlp', { method: 'POST', body: JSON.stringify(d) }),
    onSuccess: () => { toast.success('Rule added'); qc.invalidateQueries({ queryKey: ['dlp'] }); setShowAdd(false); setForm({ name: '', pattern: '', action: 'tag', description: '' }); },
    onError: (e: any) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch('/dlp/' + id, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['dlp'] }); },
  });

  const syncMut = useMutation({
    mutationFn: () => apiFetch('/dlp/sync', { method: 'POST' }),
    onSuccess: (d: any) => toast.success('Synced ' + (d.synced || 0) + ' rules to Rspamd'),
    onError: (e: any) => toast.error(e.message),
  });

  const actionBadge: Record<string, string> = {
    block: 'danger', tag: 'info', quarantine: 'warning',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Regex-based DLP rules applied via Rspamd at SMTP time.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            {syncMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Sync to Rspamd
          </Button>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}><Plus className="w-4 h-4 mr-1" />Add Rule</Button>
        </div>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Rule Name</label><Input placeholder="Credit Card Pattern" value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Regex Pattern</label><Input placeholder="\\b4[0-9]{12}\\b" value={form.pattern} onChange={(e: any) => setForm({ ...form, pattern: e.target.value })} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Action</label>
              <select value={form.action} onChange={(e: any) => setForm({ ...form, action: e.target.value })} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
                <option value="tag">Tag (add header)</option>
                <option value="quarantine">Quarantine</option>
                <option value="block">Block (reject)</option>
              </select>
            </div>
            <div><label className="text-xs text-gray-500 mb-1 block">Description</label><Input placeholder="PCI-DSS credit card detection" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <Button onClick={() => form.name && form.pattern && addMut.mutate(form)} disabled={addMut.isPending || !form.name || !form.pattern}>
            {addMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Add DLP Rule
          </Button>
        </CardContent></Card>
      )}

      <Card><CardHeader><CardTitle className="text-sm font-medium text-gray-500">System Rules (built-in, always active)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Action</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={3}><Loader2 className="w-4 h-4 animate-spin" /></TableCell></TableRow> :
                systemRules.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell><Badge variant={(actionBadge[r.action] || 'default') as any}>{r.action}</Badge></TableCell>
                    <TableCell className="text-sm text-gray-500">{r.description}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle className="text-sm font-medium text-gray-500">Custom Rules</CardTitle></CardHeader>
        <CardContent className="p-0">
          {customRules.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">No custom rules. Add one above.</div>
          ) : (
            <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Pattern</TableHead><TableHead>Action</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {customRules.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell><code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{r.pattern?.substring(0, 40)}...</code></TableCell>
                    <TableCell><Badge variant={(actionBadge[r.action] || 'default') as any}>{r.action}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => delMut.mutate(r.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── DKIM ──────────────────────────────────────────────────
function DKIMTab() {
  const [rotating, setRotating] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['dkim'], queryFn: () => apiFetch('/dkim-rotation') });
  const domains: any[] = data?.domains || [];

  const rotate = async (domain: string) => {
    setRotating(domain);
    try {
      const res = await apiFetch('/dkim-rotation/' + encodeURIComponent(domain), { method: 'POST' });
      setResult(res);
      toast.success('New DKIM key generated for ' + domain);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRotating(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Rotate DKIM signing keys. After rotation, add the new TXT record to DNS, then delete the old one after 48h.</p>
      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-green-800 mb-2">New key generated — add to DNS:</p>
            <div className="flex items-start gap-2">
              <code className="text-xs bg-white border border-green-200 rounded p-2 flex-1 whitespace-pre-wrap">{result.selector}._domainkey.{result.domain} IN TXT {result.dns_record}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(result.dns_record); toast.success('Copied'); }}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <Button size="sm" className="mt-2" variant="outline" onClick={() => setResult(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}
      <Card><CardContent className="p-0">
        {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> :
          domains.length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No domains found. Add a domain first.</div> :
          <Table><TableHeader><TableRow><TableHead>Domain</TableHead><TableHead>Key Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {domains.map((d: any) => (
                <TableRow key={d.domain}>
                  <TableCell className="font-medium">{d.domain}</TableCell>
                  <TableCell>{d.key_exists ? <Badge variant="success">Key exists</Badge> : <Badge variant="warning">No key</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => rotate(d.domain)} disabled={rotating === d.domain}>
                      {rotating === d.domain ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                      Rotate Key
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      </CardContent></Card>
    </div>
  );
}

// ── ARCHIVING ──────────────────────────────────────────────
function ArchivingTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['archiving'], queryFn: () => apiFetch('/archiving') });
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<any>(null);
  const current = cfg ?? data ?? { enabled: false, retention_days: 365, include_attachments: true };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/archiving', { method: 'PUT', body: JSON.stringify(current) });
      toast.success('Archiving config saved');
      qc.invalidateQueries({ queryKey: ['archiving'] });
      setCfg(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Configure long-term email archiving for compliance and eDiscovery.</p>
      <Card><CardContent className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Enable Email Archiving</p>
            <p className="text-sm text-gray-500">Store all email headers and metadata</p>
          </div>
          <button onClick={() => setCfg({ ...current, enabled: !current.enabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${current.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${current.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div>
          <label className="text-sm font-medium block mb-2">Retention Period (days)</label>
          <div className="flex items-center gap-3">
            <input type="range" min="30" max="3650" value={current.retention_days}
              onChange={(e: any) => setCfg({ ...current, retention_days: parseInt(e.target.value) })}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
            <span className="text-sm font-medium w-20 text-right">{current.retention_days} days</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1"><span>30d</span><span>1yr</span><span>2yr</span><span>5yr</span><span>10yr</span></div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Include Attachments</p>
            <p className="text-sm text-gray-500">Archive email attachments (increases storage usage)</p>
          </div>
          <button onClick={() => setCfg({ ...current, include_attachments: !current.include_attachments })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${current.include_attachments ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${current.include_attachments ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-600 mb-1">Storage Path</p>
          <code className="text-xs text-gray-500">/var/archive/mail</code>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Save Archiving Config
        </Button>
      </CardContent></Card>
    </div>
  );
}

// ── COMPLIANCE ──────────────────────────────────────────────
function ComplianceTab() {
  const { data, isLoading } = useQuery({ queryKey: ['compliance'], queryFn: () => apiFetch('/compliance') });

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'pass') return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (status === 'fail') return <XCircle className="w-5 h-5 text-red-500" />;
    return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
  };

  const statusBadge: Record<string, string> = { pass: 'success', fail: 'danger', info: 'warning' };

  if (isLoading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const gdpr: any[] = data?.gdpr || [];
  const hipaa: any[] = data?.hipaa || [];

  const score = (items: any[]) => {
    const pass = items.filter(i => i.status === 'pass').length;
    return { pass, total: items.length, pct: items.length ? Math.round(pass / items.length * 100) : 0 };
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Real-time compliance status against regulatory frameworks.</p>

      <div className="grid grid-cols-2 gap-4">
        {[{ name: 'GDPR', items: gdpr }, { name: 'HIPAA', items: hipaa }].map(({ name, items }) => {
          const s = score(items);
          return (
            <Card key={name}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold">{name}</p>
                  <span className={`text-lg font-bold ${s.pct >= 80 ? 'text-green-600' : s.pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>{s.pct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                  <div className={`h-2 rounded-full ${s.pct >= 80 ? 'bg-green-500' : s.pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: s.pct + '%' }} />
                </div>
                <p className="text-xs text-gray-500">{s.pass}/{s.total} checks passed</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {[{ name: 'GDPR', items: gdpr }, { name: 'HIPAA', items: hipaa }].map(({ name, items }) => (
        <Card key={name}>
          <CardHeader><CardTitle className="text-sm font-medium">{name} Checklist</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table><TableBody>
              {items.map((item: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="w-8"><StatusIcon status={item.status} /></TableCell>
                  <TableCell className="font-medium text-sm">{item.check}</TableCell>
                  <TableCell className="text-sm text-gray-500">{item.detail}</TableCell>
                  <TableCell><Badge variant={(statusBadge[item.status] || 'default') as any}>{item.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── MAIN PAGE ──────────────────────────────────────────────
export default function EnterprisePage() {
  const [tab, setTab] = useState('dlp');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Enterprise Features</h2>
        <p className="text-sm text-gray-500 mt-1">DLP, DKIM rotation, archiving, and compliance tools</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'dlp' && <DLPTab />}
        {tab === 'dkim' && <DKIMTab />}
        {tab === 'archiving' && <ArchivingTab />}
        {tab === 'compliance' && <ComplianceTab />}
      </div>
    </div>
  );
}
