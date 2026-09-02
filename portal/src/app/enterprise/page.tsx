'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
  Shield, RefreshCw, Loader2, Plus, Trash2, Copy, CheckCircle, XCircle,
  AlertTriangle, Key, Building2, Server, Globe, Lock, Info, ToggleLeft, ToggleRight, TestTube
} from 'lucide-react';
import toast from 'react-hot-toast';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') || '' : ''; }
const H = () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() });

const apiFetch = async (path: string, base: string, opts: RequestInit = {}) => {
  const r = await fetch(base + path, { headers: H() as any, ...opts });
  if (!r.ok) { const text = await r.text(); throw new Error(text || r.statusText); }
  return r.json();
};

const entFetch = (path: string, opts: RequestInit = {}) => apiFetch(path, '/api/v1/enterprise', opts);

const TABS = [
  { id: 'origin-servers', label: 'Origin Servers', icon: Server },
  { id: 'dlp', label: 'DLP Rules', icon: Shield },
  { id: 'dkim', label: 'DKIM Rotation', icon: Key },
  { id: 'archiving', label: 'Archiving', icon: Building2 },
  { id: 'compliance', label: 'Compliance', icon: CheckCircle },
];

// ── ORIGIN SERVERS (ex Trusted Hosts) ────────────────────
function OriginServersTab() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({ address: '', label: '', authType: 'smtp_auth', username: '', password: '' });

  const { data: hostsData, isLoading } = useQuery({
    queryKey: ['trusted-hosts'],
    queryFn: () => cmpApi.trustedHosts.list(),
    refetchInterval: 30000,
  });
  const { data: stats } = useQuery({
    queryKey: ['trusted-hosts-stats'],
    queryFn: () => cmpApi.trustedHosts.stats(),
  });

  const addMut = useMutation({
    mutationFn: (data: any) => cmpApi.trustedHosts.add({ ...data, auth_type: data.authType }),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Origin server added');
      setAddOpen(false);
      setForm({ address: '', label: '', authType: 'smtp_auth', username: '', password: '' });
      setTestResult(null);
      qc.invalidateQueries({ queryKey: ['trusted-hosts'] });
    },
    onError: () => toast.error('Failed to add origin server'),
  });

  const removeMut = useMutation({
    mutationFn: (address: string) => cmpApi.trustedHosts.remove(address),
    onSuccess: () => { toast.success('Origin server removed'); qc.invalidateQueries({ queryKey: ['trusted-hosts'] }); },
    onError: () => toast.error('Failed to remove origin server'),
  });

  const toggleMut = useMutation({
    mutationFn: ({ address, enabled }: { address: string; enabled: boolean }) =>
      cmpApi.trustedHosts.toggle(address, enabled),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['trusted-hosts'] }); },
    onError: () => toast.error('Failed to update status'),
  });

  const testConnection = async () => {
    setTesting(true); setTestResult(null);
    try {
      const result = await cmpApi.trustedHosts.test(
        form.address,
        form.authType === 'smtp_auth' ? 587 : 25,
      );
      // Also verify credential locally before showing result
      if (form.authType === 'smtp_auth' && form.username && form.password) {
        const credCheck = await fetch('/api/v1/trusted-hosts/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') || '' : '') },
          body: JSON.stringify({ address: form.address, port: 587, auth_type: form.authType, username: form.username, password: form.password }),
        });
        const credResult = await credCheck.json();
        setTestResult(credResult);
        return;
      }
      setTestResult(result);
    } catch { setTestResult({ success: false, reachable: false, message: 'Test failed' }); }
    finally { setTesting(false); }
  };

  const hosts = hostsData?.items || [];

  return (
    <div className="space-y-6">
      {/* Flow diagram */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-blue-600" />
            <p className="font-medium text-blue-900">How Mail Relay Works</p>
          </div>
          <div className="flex items-center justify-center gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border">
              <Server className="w-4 h-4 text-gray-500" /><span className="font-medium">Your Mail Server</span>
            </div>
            <span className="text-blue-600 font-mono">→ SMTP →</span>
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-blue-300">
              <Shield className="w-4 h-4 text-blue-600" /><span className="font-medium text-blue-700">CMP Gateway</span>
              <span className="text-xs text-gray-500">(filter)</span>
            </div>
            <span className="text-blue-600 font-mono">→ SMTP →</span>
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border">
              <Globe className="w-4 h-4 text-gray-500" /><span className="font-medium">Internet</span>
            </div>
          </div>
          <p className="text-xs text-blue-700 mt-3 text-center">
            Only registered origin servers can relay email through CMP Gateway.
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Origin Servers</p><p className="text-2xl font-bold">{hosts.length}</p></div>
            <Server className="w-8 h-8 text-blue-500 opacity-40" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Emails Relayed</p><p className="text-2xl font-bold text-green-600">{stats?.totalRelayed || 0}</p></div>
            <CheckCircle className="w-8 h-8 text-green-500 opacity-40" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Rejected</p><p className="text-2xl font-bold text-red-600">{stats?.totalRejected || 0}</p></div>
            <XCircle className="w-8 h-8 text-red-500 opacity-40" />
          </div>
        </CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Origin Servers</CardTitle>
            <CardDescription>Mail servers allowed to relay through CMP for filtering</CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add Server</Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : hosts.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-gray-400">
              <Server className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">No origin servers configured</p>
              <p className="text-sm mt-1">Add your mail server IP to start relaying through CMP</p>
              <Button variant="outline" className="mt-4" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />Add First Server
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Auth Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hosts.map((host: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{host.address}</TableCell>
                    <TableCell>{host.label || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={host.type === 'ip' ? 'info' : host.type === 'cidr' ? 'default' : 'warning'}>
                        {host.type === 'ip' ? 'IP Address' : host.type === 'cidr' ? 'CIDR Range' : host.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleMut.mutate({ address: host.address, enabled: !host.enabled })}>
                          {host.enabled
                            ? <ToggleRight className="w-5 h-5 text-green-600" />
                            : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                        </button>
                        <Badge variant={host.enabled ? 'success' : 'outline'}>{host.enabled ? 'Active' : 'Disabled'}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{host.source || 'manual'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeMut.mutate(host.address)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Auth methods info */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5" />Authentication Methods</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'SMTP Auth', desc: 'Username + password verified against origin server. Requires SMTP AUTH LOGIN or PLAIN support.', badge: 'warning', label: 'Standard' },
              { title: 'API Token', desc: 'Pre-shared secret (min 32 chars). Verify with: openssl rand -hex 32', badge: 'success', label: 'Recommended' },
            ].map(m => (
              <div key={m.title} className="p-4 border rounded-lg">
                <h4 className="font-medium mb-2">{m.title}</h4>
                <p className="text-sm text-gray-600">{m.desc}</p>
                <Badge variant={m.badge as any} className="mt-2">{m.label}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Origin Server</DialogTitle>
            <DialogDescription>Register your mail server to relay outbound email through CMP</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium block mb-1">Server IP / CIDR</label>
              <Input placeholder="203.0.113.10 or 203.0.113.0/24" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div><label className="text-sm font-medium block mb-1">Label (optional)</label>
              <Input placeholder="Mail server Jakarta" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Authentication Type</label>
              <div className="flex gap-2">
                {[
                    { id: 'smtp_auth', label: 'SMTP Auth', desc: 'Username + password' },
                    { id: 'api_token', label: 'API Token', desc: 'Pre-shared secret ≥32 chars' },
                  ].map(opt => (
                  <button key={opt.id} onClick={() => setForm({ ...form, authType: opt.id })}
                    className={`flex flex-col px-3 py-2.5 text-sm rounded-md border transition-colors text-left ${form.authType === opt.id ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs opacity-60">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            {form.authType === 'smtp_auth' && (
              <>
                <div><label className="text-sm font-medium block mb-1">SMTP Username <span className="text-red-500">*</span></label>
                  <Input placeholder="relay@yourmailserver.com" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
                </div>
                <div><label className="text-sm font-medium block mb-1">SMTP Password <span className="text-red-500">*</span></label>
                  <Input type="password" placeholder="········" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                </div>
              </>
            )}
            {form.authType === 'api_token' && (
              <div>
                <label className="text-sm font-medium block mb-1">
                  API Token <span className="text-red-500">*</span>
                  <span className="ml-2 text-xs text-gray-400 font-normal">(min 32 chars)</span>
                </label>
                <Input
                  type="password"
                  placeholder="Paste pre-shared token or run: openssl rand -hex 32"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Generate on origin server: <code className="bg-gray-100 px-1 rounded">openssl rand -hex 32</code>
                </p>
              </div>
            )}
            {form.address && (
              <div>
                {testResult && (
                  <div className={`p-3 rounded-lg border mb-2 ${testResult.reachable ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                    <div className="flex items-center gap-2">
                      {testResult.reachable
                        ? <CheckCircle className="w-4 h-4 text-green-600" />
                        : <AlertTriangle className="w-4 h-4 text-yellow-600" />}
                      <p className={`text-sm ${testResult.reachable ? 'text-green-700' : 'text-yellow-700'}`}>{testResult.message}</p>
                    </div>
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={testConnection} disabled={testing}>
                  {testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <TestTube className="w-4 h-4 mr-1" />}
                  Test Connection
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setTestResult(null); }}>Cancel</Button>
            <Button
              onClick={() => addMut.mutate({
                ...form,
                auth_type: form.authType,
                api_token: form.authType === 'api_token' ? form.password : '',
                password: form.authType === 'smtp_auth' ? form.password : '',
              })}
              disabled={
                !form.address ||
                !form.authType ||
                (form.authType === 'smtp_auth' && (!form.username || !form.password)) ||
                (form.authType === 'api_token' && (!form.password || form.password.length < 32)) ||
                addMut.isPending
              }>
              {addMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Verify &amp; Add Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── DLP ──────────────────────────────────────────────────
function DLPTab() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', pattern: '', action: 'tag', description: '' });
  const { data, isLoading } = useQuery({ queryKey: ['dlp'], queryFn: () => entFetch('/dlp') });
  const systemRules: any[] = data?.system_rules || [];
  const customRules: any[] = data?.custom_rules || [];
  const addMut = useMutation({
    mutationFn: (d: any) => entFetch('/dlp', { method: 'POST', body: JSON.stringify(d) }),
    onSuccess: () => { toast.success('Rule added'); qc.invalidateQueries({ queryKey: ['dlp'] }); setShowAdd(false); setForm({ name: '', pattern: '', action: 'tag', description: '' }); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => entFetch('/dlp/' + id, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['dlp'] }); },
  });
  const syncMut = useMutation({
    mutationFn: () => entFetch('/dlp/sync', { method: 'POST' }),
    onSuccess: (d: any) => toast.success('Synced ' + (d.synced || 0) + ' rules to Rspamd'),
    onError: (e: any) => toast.error(e.message),
  });
  const actionBadge: Record<string, string> = { block: 'danger', tag: 'info', quarantine: 'warning' };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Regex-based DLP rules applied via Rspamd at SMTP time.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            {syncMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}Sync to Rspamd
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
            <TableBody>{isLoading ? <TableRow><TableCell colSpan={3}><Loader2 className="w-4 h-4 animate-spin" /></TableCell></TableRow> :
              systemRules.map((r: any) => (
                <TableRow key={r.id}><TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant={(actionBadge[r.action] || 'default') as any}>{r.action}</Badge></TableCell>
                  <TableCell className="text-sm text-gray-500">{r.description}</TableCell>
                </TableRow>
              ))}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-sm font-medium text-gray-500">Custom Rules</CardTitle></CardHeader>
        <CardContent className="p-0">
          {customRules.length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No custom rules. Add one above.</div> : (
            <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Pattern</TableHead><TableHead>Action</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>{customRules.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{r.pattern?.substring(0, 40)}...</code></TableCell>
                  <TableCell><Badge variant={(actionBadge[r.action] || 'default') as any}>{r.action}</Badge></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => delMut.mutate(r.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}</TableBody>
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
  const [result, setResult] = useState<any>(null);
  const { data, isLoading } = useQuery({ queryKey: ['dkim'], queryFn: () => entFetch('/dkim-rotation') });
  const domains: any[] = data?.domains || [];
  const rotate = async (domain: string) => {
    setRotating(domain);
    try {
      const res = await entFetch('/dkim-rotation/' + encodeURIComponent(domain), { method: 'POST' });
      setResult(res); toast.success('New DKIM key generated for ' + domain);
    } catch (e: any) { toast.error(e.message); } finally { setRotating(null); }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Rotate DKIM signing keys. After rotation, add the new TXT record to DNS, then delete the old one after 48h.</p>
      {result && (
        <Card className="border-green-200 bg-green-50"><CardContent className="p-4">
          <p className="text-sm font-semibold text-green-800 mb-2">New key generated — add to DNS:</p>
          <div className="flex items-start gap-2">
            <code className="text-xs bg-white border border-green-200 rounded p-2 flex-1 whitespace-pre-wrap">{result.selector}._domainkey.{result.domain} IN TXT {result.dns_record}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(result.dns_record); toast.success('Copied'); }}><Copy className="w-4 h-4" /></Button>
          </div>
          <Button size="sm" className="mt-2" variant="outline" onClick={() => setResult(null)}>Dismiss</Button>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0">
        {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> :
          domains.length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No domains found. Add a domain first.</div> :
          <Table><TableHeader><TableRow><TableHead>Domain</TableHead><TableHead>Key Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>{domains.map((d: any) => (
              <TableRow key={d.domain}>
                <TableCell className="font-medium">{d.domain}</TableCell>
                <TableCell>{d.key_exists ? <Badge variant="success">Key exists</Badge> : <Badge variant="warning">No key</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => rotate(d.domain)} disabled={rotating === d.domain}>
                    {rotating === d.domain ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}Rotate Key
                  </Button>
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        }
      </CardContent></Card>
    </div>
  );
}

// ── ARCHIVING ──────────────────────────────────────────────
function ArchivingTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['archiving'], queryFn: () => entFetch('/archiving') });
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<any>(null);
  const current = cfg ?? data ?? { enabled: false, retention_days: 365, include_attachments: true };
  const save = async () => {
    setSaving(true);
    try { await entFetch('/archiving', { method: 'PUT', body: JSON.stringify(current) }); toast.success('Archiving config saved'); qc.invalidateQueries({ queryKey: ['archiving'] }); setCfg(null); }
    catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  if (isLoading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Configure long-term email archiving for compliance and eDiscovery.</p>
      <Card><CardContent className="p-6 space-y-6">
        {[
          { key: 'enabled', label: 'Enable Email Archiving', desc: 'Store all email headers and metadata' },
          { key: 'include_attachments', label: 'Include Attachments', desc: 'Archive email attachments (increases storage usage)' },
        ].map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between">
            <div><p className="font-medium">{label}</p><p className="text-sm text-gray-500">{desc}</p></div>
            <button onClick={() => setCfg({ ...current, [key]: !current[key] })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${current[key] ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${current[key] ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        ))}
        <div>
          <label className="text-sm font-medium block mb-2">Retention Period (days)</label>
          <div className="flex items-center gap-3">
            <input type="range" min="30" max="3650" value={current.retention_days}
              onChange={(e: any) => setCfg({ ...current, retention_days: parseInt(e.target.value) })}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
            <span className="text-sm font-medium w-20 text-right">{current.retention_days} days</span>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs font-medium text-gray-600 mb-1">Storage Path</p><code className="text-xs text-gray-500">/var/archive/mail</code></div>
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Save Archiving Config
        </Button>
      </CardContent></Card>
    </div>
  );
}

// ── COMPLIANCE ──────────────────────────────────────────────
function ComplianceTab() {
  const { data, isLoading } = useQuery({ queryKey: ['compliance'], queryFn: () => entFetch('/compliance') });
  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'pass') return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (status === 'fail') return <XCircle className="w-5 h-5 text-red-500" />;
    return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
  };
  const statusBadge: Record<string, string> = { pass: 'success', fail: 'danger', info: 'warning' };
  if (isLoading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  const gdpr: any[] = data?.gdpr || [];
  const hipaa: any[] = data?.hipaa || [];
  const score = (items: any[]) => { const pass = items.filter(i => i.status === 'pass').length; return { pass, total: items.length, pct: items.length ? Math.round(pass / items.length * 100) : 0 }; };
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Real-time compliance status against regulatory frameworks.</p>
      <div className="grid grid-cols-2 gap-4">
        {[{ name: 'GDPR', items: gdpr }, { name: 'HIPAA', items: hipaa }].map(({ name, items }) => {
          const s = score(items);
          return (
            <Card key={name}><CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">{name}</p>
                <span className={`text-lg font-bold ${s.pct >= 80 ? 'text-green-600' : s.pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>{s.pct}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                <div className={`h-2 rounded-full ${s.pct >= 80 ? 'bg-green-500' : s.pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: s.pct + '%' }} />
              </div>
              <p className="text-xs text-gray-500">{s.pass}/{s.total} checks passed</p>
            </CardContent></Card>
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
  const [tab, setTab] = useState('origin-servers');
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Enterprise Gateway</h2>
        <p className="text-sm text-gray-500 mt-1">Origin servers, DLP, DKIM rotation, archiving, and compliance</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>
      <div>
        {tab === 'origin-servers' && <OriginServersTab />}
        {tab === 'dlp' && <DLPTab />}
        {tab === 'dkim' && <DKIMTab />}
        {tab === 'archiving' && <ArchivingTab />}
        {tab === 'compliance' && <ComplianceTab />}
      </div>
    </div>
  );
}
