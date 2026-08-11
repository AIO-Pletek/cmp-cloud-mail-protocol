'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Shield, Plus, Trash2, Loader2, Play, Globe, User, Building2, FileText, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') || '' : ''; }
const H = () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() });
const apiFetch = async (path: string, opts: RequestInit = {}) => {
  const r = await fetch('/api/v1/policy' + path, { headers: H() as any, ...opts });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || r.statusText);
  return data;
};

const TABS = [
  { id: 'global', label: 'Global Whitelist', icon: Globe },
  { id: 'personal', label: 'Personal Whitelist', icon: User },
  { id: 'cro', label: 'CRO Accounts', icon: Building2 },
  { id: 'test', label: 'Test Policy', icon: Play },
  { id: 'audit', label: 'Audit Log', icon: FileText },
];

// ── Global Whitelist ──────────────────────────────────
function GlobalWLTab() {
  const qc = useQueryClient();
  const [pattern, setPattern] = useState('');
  const [desc, setDesc] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const { data = [], isLoading } = useQuery({ queryKey: ['policy-gw'], queryFn: () => apiFetch('/global-whitelist') });

  const addMut = useMutation({
    mutationFn: () => apiFetch('/global-whitelist', { method: 'POST', body: JSON.stringify({ pattern, description: desc }) }),
    onSuccess: () => { toast.success('Pattern added'); qc.invalidateQueries({ queryKey: ['policy-gw'] }); setPattern(''); setDesc(''); setShowAdd(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch('/global-whitelist/' + id, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['policy-gw'] }); },
  });

  const examples = ['*.go.id', '*.co.id', '*.or.id', '*.ccb.com', '*.bankccb.com', '*.ccbf.com', '*.ccb.com.sg'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Trusted sender/recipient domain patterns. Use *.domain.com for subdomains, exact for bare domain.</p>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}><Plus className="w-4 h-4 mr-1" />{showAdd ? 'Cancel' : 'Add Pattern'}</Button>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Domain Pattern</label>
              <Input placeholder="*.ccb.com" value={pattern} onChange={(e: any) => setPattern(e.target.value)} />
              <div className="flex flex-wrap gap-1 mt-2">
                {examples.map(ex => <button key={ex} onClick={() => setPattern(ex)} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100">{ex}</button>)}
              </div>
            </div>
            <div><label className="text-xs text-gray-500 mb-1 block">Description</label><Input placeholder="CCB Group domains" value={desc} onChange={(e: any) => setDesc(e.target.value)} /></div>
          </div>
          <Button onClick={() => pattern && addMut.mutate()} disabled={addMut.isPending || !pattern}>
            {addMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Add to Global Whitelist
          </Button>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> :
          (data as any[]).length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No patterns yet. Add domain patterns above.</div> :
          <Table><TableHeader><TableRow><TableHead>Pattern</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>{(data as any[]).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell><code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">{r.pattern}</code></TableCell>
                <TableCell className="text-sm text-gray-500">{r.description || '-'}</TableCell>
                <TableCell><Badge variant={r.enabled ? 'success' : 'outline'}>{r.enabled ? 'Active' : 'Disabled'}</Badge></TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => delMut.mutate(r.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>}
      </CardContent></Card>
    </div>
  );
}

// ── Personal Whitelist ──────────────────────────────────
function PersonalWLTab() {
  const qc = useQueryClient();
  const [account, setAccount] = useState('');
  const [allowed, setAllowed] = useState('');
  const [desc, setDesc] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const { data = [], isLoading } = useQuery({ queryKey: ['policy-pw'], queryFn: () => apiFetch('/personal-whitelist') });

  const addMut = useMutation({
    mutationFn: () => apiFetch('/personal-whitelist', { method: 'POST', body: JSON.stringify({ account, allowed, description: desc }) }),
    onSuccess: () => { toast.success('Entry added'); qc.invalidateQueries({ queryKey: ['policy-pw'] }); setAccount(''); setAllowed(''); setDesc(''); setShowAdd(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch('/personal-whitelist/' + id, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['policy-pw'] }); },
  });

  // Group by account
  const grouped = (data as any[]).reduce((acc: any, r: any) => {
    acc[r.account] = acc[r.account] || [];
    acc[r.account].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Account-scoped whitelist. Each entry is isolated — user A's whitelist never applies to user B.</p>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}><Plus className="w-4 h-4 mr-1" />{showAdd ? 'Cancel' : 'Add Entry'}</Button>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Internal Account</label><Input placeholder="abc@idn.ccb.com" value={account} onChange={(e: any) => setAccount(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Allowed Email/Domain</label><Input placeholder="xyz@gmail.com" value={allowed} onChange={(e: any) => setAllowed(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Description</label><Input placeholder="Personal contact" value={desc} onChange={(e: any) => setDesc(e.target.value)} /></div>
          </div>
          <Button onClick={() => account && allowed && addMut.mutate()} disabled={addMut.isPending || !account || !allowed}>
            {addMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Add Entry
          </Button>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> :
          Object.keys(grouped).length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No entries. Add personal whitelist entries above.</div> :
          <div>{Object.entries(grouped).map(([acct, entries]: any) => (
            <div key={acct} className="border-b last:border-0">
              <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-600 flex items-center gap-2">
                <User className="w-3 h-3" /> {acct}
                <span className="text-gray-400 font-normal">({entries.length} allowed)</span>
              </div>
              {entries.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                    <code className="text-sm font-mono">{r.allowed}</code>
                    {r.description && <span className="text-xs text-gray-400">— {r.description}</span>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => delMut.mutate(r.id)} className="text-red-600 h-6 w-6 p-0"><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
            </div>
          ))}</div>}
      </CardContent></Card>
    </div>
  );
}

// ── CRO Accounts ──────────────────────────────────
function CROTab() {
  const qc = useQueryClient();
  const [pattern, setPattern] = useState('');
  const [branch, setBranch] = useState('');
  const [desc, setDesc] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const { data = [], isLoading } = useQuery({ queryKey: ['policy-cro'], queryFn: () => apiFetch('/cro-accounts') });

  const addMut = useMutation({
    mutationFn: () => apiFetch('/cro-accounts', { method: 'POST', body: JSON.stringify({ account_pattern: pattern, branch_name: branch, description: desc }) }),
    onSuccess: () => { toast.success('CRO account added'); qc.invalidateQueries({ queryKey: ['policy-cro'] }); setPattern(''); setBranch(''); setDesc(''); setShowAdd(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch('/cro-accounts/' + id, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['policy-cro'] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">CRO accounts: INBOUND = ALLOW ALL. OUTBOUND = whitelist only. Use email or *.branch.domain.com patterns.</p>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}><Plus className="w-4 h-4 mr-1" />{showAdd ? 'Cancel' : 'Add CRO'}</Button>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Account Pattern</label><Input placeholder="cro@idn.ccb.com or *@cro.idn.ccb.com" value={pattern} onChange={(e: any) => setPattern(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Branch Name</label><Input placeholder="CRO Jakarta" value={branch} onChange={(e: any) => setBranch(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Description</label><Input placeholder="Regulatory branch" value={desc} onChange={(e: any) => setDesc(e.target.value)} /></div>
          </div>
          <Button onClick={() => pattern && addMut.mutate()} disabled={addMut.isPending || !pattern}>
            {addMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Add CRO Account
          </Button>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> :
          (data as any[]).length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No CRO accounts configured.</div> :
          <Table><TableHeader><TableRow><TableHead>Account Pattern</TableHead><TableHead>Branch</TableHead><TableHead>Policy</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>{(data as any[]).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell><code className="text-sm font-mono bg-purple-50 px-2 py-0.5 rounded">{r.account_pattern}</code></TableCell>
                <TableCell className="text-sm">{r.branch_name || '-'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Badge variant="success" className="text-xs">Inbound: ALLOW ALL</Badge>
                    <Badge variant="warning" className="text-xs">Outbound: WL only</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => delMut.mutate(r.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>}
      </CardContent></Card>
    </div>
  );
}

// ── Test Policy ──────────────────────────────────
function TestTab() {
  const [form, setForm] = useState({ direction: 'INBOUND', sender: '', recipients: '', subject: '', attachment_protected: '', audit: false });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const body: any = {
        message_id: 'test-' + Date.now(),
        direction: form.direction,
        sender: form.sender,
        recipients: form.recipients.split(',').map((s: string) => s.trim()).filter(Boolean),
        subject: form.subject,
        audit: form.audit,
      };
      if (form.attachment_protected !== '') {
        body.attachments = [{ filename: 'test.xlsx', password_protected: form.attachment_protected === 'true' ? true : form.attachment_protected === 'false' ? false : null }];
      }
      const data = await apiFetch('/evaluate', { method: 'POST', body: JSON.stringify(body) });
      setResult(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const actionColor: Record<string, string> = { ALLOW: 'success', QUARANTINE: 'warning', BOUNCE: 'danger' };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Test policy decisions without affecting live mail. Useful for verifying whitelist rules before deployment.</p>
      <Card><CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500 mb-1 block">Direction</label>
            <select value={form.direction} onChange={(e: any) => setForm({ ...form, direction: e.target.value })} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
              <option value="INBOUND">INBOUND (external → internal)</option>
              <option value="OUTBOUND">OUTBOUND (internal → external)</option>
            </select>
          </div>
          <div><label className="text-xs text-gray-500 mb-1 block">Sender</label><Input placeholder="sender@example.com" value={form.sender} onChange={(e: any) => setForm({ ...form, sender: e.target.value })} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Recipients (comma-separated)</label><Input placeholder="user@idn.ccb.com" value={form.recipients} onChange={(e: any) => setForm({ ...form, recipients: e.target.value })} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Subject</label><Input placeholder="Test email" value={form.subject} onChange={(e: any) => setForm({ ...form, subject: e.target.value })} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Attachment (for outbound test)</label>
            <select value={form.attachment_protected} onChange={(e: any) => setForm({ ...form, attachment_protected: e.target.value })} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
              <option value="">No attachment</option>
              <option value="true">Password protected ✓</option>
              <option value="false">NOT password protected ✗</option>
              <option value="null">Inspection failed (unknown)</option>
            </select>
          </div>
          <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.audit} onChange={(e: any) => setForm({ ...form, audit: e.target.checked })} className="rounded" />
            <span className="text-sm">Save to audit log</span>
          </label></div>
        </div>
        <Button onClick={run} disabled={loading || !form.sender || !form.recipients} className="bg-blue-600 hover:bg-blue-700">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          Evaluate Policy
        </Button>
      </CardContent></Card>

      {result && (
        <Card className={result.action === 'ALLOW' ? 'border-green-200' : result.action === 'QUARANTINE' ? 'border-yellow-200' : 'border-red-200'}>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-3">
            <Badge variant={(actionColor[result.action] || 'default') as any} className="text-sm px-3 py-1">{result.action}</Badge>
            <span className="text-gray-600 font-normal text-sm">{result.reason_code}</span>
          </CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Direction:</span> <strong>{result.direction}</strong></div>
              <div><span className="text-gray-500">Matched Rule:</span> <code className="text-xs bg-gray-100 px-1 rounded">{result.matched_rule}</code></div>
              <div><span className="text-gray-500">Notify Recipient:</span> <strong>{result.notify_recipient ? 'Yes' : 'No'}</strong></div>
              <div><span className="text-gray-500">Bounce Sender:</span> <strong>{result.bounce_sender ? 'Yes' : 'No'}</strong></div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Audit Log ──────────────────────────────────
function AuditTab() {
  const { data = [], isLoading, refetch } = useQuery({ queryKey: ['policy-audit'], queryFn: () => apiFetch('/audit-log?limit=50') });
  const actionColor: Record<string, string> = { ALLOW: 'success', QUARANTINE: 'warning', BOUNCE: 'danger' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Policy evaluation audit trail. Every decision with audit=true is logged here.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}><Loader2 className="w-4 h-4 mr-1" />Refresh</Button>
      </div>
      <Card><CardContent className="p-0">
        {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> :
          (data as any[]).length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No audit entries. Use the Test Policy tab with "Save to audit log" enabled.</div> :
          <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Dir</TableHead><TableHead>Sender</TableHead><TableHead>Action</TableHead><TableHead>Rule</TableHead></TableRow></TableHeader>
            <TableBody>{(data as any[]).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString('id-ID')}</TableCell>
                <TableCell><Badge variant={r.direction === 'INBOUND' ? 'info' : 'default'} className="text-xs">{r.direction === 'INBOUND' ? '↓ IN' : '↑ OUT'}</Badge></TableCell>
                <TableCell className="text-sm font-mono">{r.sender}</TableCell>
                <TableCell><Badge variant={(actionColor[r.action] || 'default') as any}>{r.action}</Badge></TableCell>
                <TableCell className="text-xs text-gray-500 max-w-xs truncate">{r.matched_rule}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>}
      </CardContent></Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────
export default function PolicyEnginePage() {
  const [tab, setTab] = useState('global');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Shield className="w-7 h-7 text-blue-600" /> Email Security Policy Engine</h2>
        <p className="text-sm text-gray-500 mt-1">Centralized policy: Global Whitelist, Personal Whitelist, CRO rules, Attachment security. Priority: Attachment → CRO → Personal WL → Global WL → Default.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={"flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors " + (tab === t.id ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'global' && <GlobalWLTab />}
      {tab === 'personal' && <PersonalWLTab />}
      {tab === 'cro' && <CROTab />}
      {tab === 'test' && <TestTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
