'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Shield, Plus, Trash2, Loader2, Play, Globe, User, Building2, FileText, ChevronRight, Settings as SettingsIcon, Pencil, Check, X, Save } from 'lucide-react';
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
  { id: 'settings', label: 'Policy Settings', icon: SettingsIcon },
  { id: 'test', label: 'Test Policy', icon: Play },
  { id: 'audit', label: 'Audit Log', icon: FileText },
];

// ── Global Whitelist ──────────────────────────────────
function GlobalWLTab() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pattern, setPattern] = useState('');
  const [desc, setDesc] = useState('');
  const [editPattern, setEditPattern] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const { data = [], isLoading } = useQuery({ queryKey: ['policy-gw'], queryFn: () => apiFetch('/global-whitelist') });

  const addMut = useMutation({
    mutationFn: () => apiFetch('/global-whitelist', { method: 'POST', body: JSON.stringify({ pattern, description: desc }) }),
    onSuccess: () => { toast.success('Added'); qc.invalidateQueries({ queryKey: ['policy-gw'] }); setPattern(''); setDesc(''); setShowAdd(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const editMut = useMutation({
    mutationFn: (id: string) => apiFetch('/global-whitelist/' + id, { method: 'PUT', body: JSON.stringify({ pattern: editPattern, description: editDesc }) }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['policy-gw'] }); setEditingId(null); },
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
        <p className="text-sm text-gray-500">Trusted domain patterns. *.domain.com = subdomain matching (evil-ccb.com does NOT match *.ccb.com).</p>
        <Button size="sm" onClick={() => { setShowAdd(!showAdd); setEditingId(null); }}>
          {showAdd ? 'Cancel' : <><Plus className="w-4 h-4 mr-1" />Add Pattern</>}
        </Button>
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
          (data as any[]).length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No patterns yet.</div> :
          <Table><TableHeader><TableRow><TableHead>Pattern</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="text-right w-24">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{(data as any[]).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>
                  {editingId === r.id ? <Input value={editPattern} onChange={(e: any) => setEditPattern(e.target.value)} className="w-48 h-8 text-sm font-mono" /> :
                    <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">{r.pattern}</code>}
                </TableCell>
                <TableCell>
                  {editingId === r.id ? <Input value={editDesc} onChange={(e: any) => setEditDesc(e.target.value)} className="w-48 h-8 text-sm" /> :
                    <span className="text-sm text-gray-500">{r.description || '-'}</span>}
                </TableCell>
                <TableCell><Badge variant={r.enabled ? 'success' : 'outline'}>{r.enabled ? 'Active' : 'Disabled'}</Badge></TableCell>
                <TableCell className="text-right">
                  {editingId === r.id ? (
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => editMut.mutate(r.id)} disabled={editMut.isPending}>
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        <X className="w-4 h-4 text-gray-400" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingId(r.id); setEditPattern(r.pattern); setEditDesc(r.description || ''); }}>
                        <Pencil className="w-4 h-4 text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => delMut.mutate(r.id)} className="text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
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
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [account, setAccount] = useState('');
  const [allowed, setAllowed] = useState('');
  const [desc, setDesc] = useState('');
  const [editAllowed, setEditAllowed] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const { data = [], isLoading } = useQuery({ queryKey: ['policy-pw'], queryFn: () => apiFetch('/personal-whitelist') });

  const addMut = useMutation({
    mutationFn: () => apiFetch('/personal-whitelist', { method: 'POST', body: JSON.stringify({ account, allowed, description: desc }) }),
    onSuccess: () => { toast.success('Added'); qc.invalidateQueries({ queryKey: ['policy-pw'] }); setAccount(''); setAllowed(''); setDesc(''); setShowAdd(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const editMut = useMutation({
    mutationFn: (id: string) => apiFetch('/personal-whitelist/' + id, { method: 'PUT', body: JSON.stringify({ allowed: editAllowed, description: editDesc }) }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['policy-pw'] }); setEditingId(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: any) => apiFetch('/personal-whitelist/' + id + '/toggle', { method: 'PUT', body: JSON.stringify({ enabled }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['policy-pw'] }); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch('/personal-whitelist/' + id, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['policy-pw'] }); },
  });

  const grouped = (data as any[]).reduce((acc: any, r: any) => {
    acc[r.account] = acc[r.account] || [];
    acc[r.account].push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Account-scoped whitelist. User A's whitelist never applies to user B.</p>
        <Button size="sm" onClick={() => { setShowAdd(!showAdd); setEditingId(null); }}>
          {showAdd ? 'Cancel' : <><Plus className="w-4 h-4 mr-1" />Add Entry</>}
        </Button>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Internal Account</label><Input placeholder="abc@idn.ccb.com" value={account} onChange={(e: any) => setAccount(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Allowed Email/Domain</label><Input placeholder="xyz@gmail.com" value={allowed} onChange={(e: any) => setAllowed(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Description</label><Input placeholder="Partner contact" value={desc} onChange={(e: any) => setDesc(e.target.value)} /></div>
          </div>
          <Button onClick={() => account && allowed && addMut.mutate()} disabled={addMut.isPending || !account || !allowed}>
            {addMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Add Entry
          </Button>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> :
          Object.keys(grouped).length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No entries yet.</div> :
          <div>{Object.entries(grouped).map(([acct, entries]: any) => (
            <div key={acct} className="border-b last:border-0">
              <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-600 flex items-center gap-2">
                <User className="w-3 h-3" /> {acct} <span className="text-gray-400 font-normal">({entries.length} allowed)</span>
              </div>
              {entries.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                    {editingId === r.id ? (
                      <div className="flex items-center gap-2">
                        <Input value={editAllowed} onChange={(e: any) => setEditAllowed(e.target.value)} className="w-48 h-7 text-sm font-mono" />
                        <Input value={editDesc} onChange={(e: any) => setEditDesc(e.target.value)} className="w-36 h-7 text-sm" />
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => editMut.mutate(r.id)}><Check className="w-3 h-3 text-green-600" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}><X className="w-3 h-3 text-gray-400" /></Button>
                      </div>
                    ) : (
                      <>
                        <code className="text-sm font-mono">{r.allowed}</code>
                        {r.description && <span className="text-xs text-gray-400">— {r.description}</span>}
                      </>
                    )}
                  </div>
                  {editingId !== r.id && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleMut.mutate({ id: r.id, enabled: !r.enabled })}>
                        <Badge variant={r.enabled ? 'success' : 'outline'} className="text-xs cursor-pointer">{r.enabled ? 'ON' : 'OFF'}</Badge>
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingId(r.id); setEditAllowed(r.allowed); setEditDesc(r.description || ''); }}><Pencil className="w-3 h-3 text-blue-600" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-600" onClick={() => delMut.mutate(r.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  )}
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
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pattern, setPattern] = useState('');
  const [branch, setBranch] = useState('');
  const [desc, setDesc] = useState('');
  const [editPattern, setEditPattern] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const { data = [], isLoading } = useQuery({ queryKey: ['policy-cro'], queryFn: () => apiFetch('/cro-accounts') });

  const addMut = useMutation({
    mutationFn: () => apiFetch('/cro-accounts', { method: 'POST', body: JSON.stringify({ account_pattern: pattern, branch_name: branch, description: desc }) }),
    onSuccess: () => { toast.success('Added'); qc.invalidateQueries({ queryKey: ['policy-cro'] }); setPattern(''); setBranch(''); setDesc(''); setShowAdd(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const editMut = useMutation({
    mutationFn: (id: string) => apiFetch('/cro-accounts/' + id, { method: 'PUT', body: JSON.stringify({ account_pattern: editPattern, branch_name: editBranch, description: editDesc }) }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['policy-cro'] }); setEditingId(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch('/cro-accounts/' + id, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['policy-cro'] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">CRO accounts: INBOUND = allow all. OUTBOUND = whitelist only.</p>
        <Button size="sm" onClick={() => { setShowAdd(!showAdd); setEditingId(null); }}>
          {showAdd ? 'Cancel' : <><Plus className="w-4 h-4 mr-1" />Add CRO</>}
        </Button>
      </div>
      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Account Pattern</label><Input placeholder="cro@idn.ccb.com" value={pattern} onChange={(e: any) => setPattern(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Branch Name</label><Input placeholder="CRO Jakarta" value={branch} onChange={(e: any) => setBranch(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Description</label><Input placeholder="Regulatory branch" value={desc} onChange={(e: any) => setDesc(e.target.value)} /></div>
          </div>
          <Button onClick={() => pattern && addMut.mutate()} disabled={addMut.isPending || !pattern}>Add CRO Account</Button>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0">
        {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> :
          (data as any[]).length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No CRO accounts.</div> :
          <Table><TableHeader><TableRow><TableHead>Pattern</TableHead><TableHead>Branch</TableHead><TableHead>Description</TableHead><TableHead>Policy</TableHead><TableHead className="text-right w-24">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{(data as any[]).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>
                  {editingId === r.id ? <Input value={editPattern} onChange={(e: any) => setEditPattern(e.target.value)} className="w-48 h-8 text-sm font-mono" /> :
                    <code className="text-sm font-mono bg-purple-50 px-2 py-0.5 rounded">{r.account_pattern}</code>}
                </TableCell>
                <TableCell>
                  {editingId === r.id ? <Input value={editBranch} onChange={(e: any) => setEditBranch(e.target.value)} className="w-36 h-8 text-sm" /> :
                    <span className="text-sm">{r.branch_name || '-'}</span>}
                </TableCell>
                <TableCell>
                  {editingId === r.id ? <Input value={editDesc} onChange={(e: any) => setEditDesc(e.target.value)} className="w-36 h-8 text-sm" /> :
                    <span className="text-sm text-gray-500">{r.description || '-'}</span>}
                </TableCell>
                <TableCell><div className="flex gap-1"><Badge variant="success" className="text-xs">In: ALLOW ALL</Badge><Badge variant="warning" className="text-xs">Out: WL only</Badge></div></TableCell>
                <TableCell className="text-right">
                  {editingId === r.id ? (
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => editMut.mutate(r.id)}><Check className="w-4 h-4 text-green-600" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><X className="w-4 h-4 text-gray-400" /></Button>
                    </div>
                  ) : (
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingId(r.id); setEditPattern(r.account_pattern); setEditBranch(r.branch_name || ''); setEditDesc(r.description || ''); }}><Pencil className="w-4 h-4 text-blue-600" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => delMut.mutate(r.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>}
      </CardContent></Card>
    </div>
  );
}

// ── Policy Settings ──────────────────────────────────
function SettingsTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const { data, isLoading } = useQuery({ queryKey: ['policy-settings'], queryFn: () => apiFetch('/settings') });

  useEffect(() => { if (data) setForm({ ...data }); }, [data]);

  const saveMut = useMutation({
    mutationFn: () => apiFetch('/settings', { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => { toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['policy-settings'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !form) return <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Configure policy engine behavior. Changes apply to all future email evaluations.</p>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Policy Priority (top to bottom)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {form.priority_order.map((rule: string, i: number) => (
              <div key={rule} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                <span className="w-6 h-6 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold">{i + 1}</span>
                <span className="text-sm font-mono">{rule}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {rule === 'attachment_security' && 'Outbound attachment must be password protected'}
                  {rule === 'cro' && 'CRO inbound allow all, outbound whitelist only'}
                  {rule === 'personal_whitelist' && 'Account-scoped allow list'}
                  {rule === 'global_whitelist' && 'Organization-wide domain patterns'}
                  {rule === 'default' && 'Catch-all: quarantine inbound, bounce outbound'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Priority order is evaluated top to bottom. First match wins.</p>
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Attachment Security</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div><p className="text-sm font-medium">Require password-protected attachments</p><p className="text-xs text-gray-500">Outbound email with unprotected attachments will be bounced</p></div>
            <input type="checkbox" checked={form.require_attachment_password} onChange={(e: any) => setForm({ ...form, require_attachment_password: e.target.checked })} className="w-5 h-5 rounded" />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <div><p className="text-sm font-medium">Fail-closed on inspection failure</p><p className="text-xs text-gray-500">If attachment type cannot be inspected, bounce instead of allowing</p></div>
            <input type="checkbox" checked={form.fail_closed_on_inspection_failure} onChange={(e: any) => setForm({ ...form, fail_closed_on_inspection_failure: e.target.checked })} className="w-5 h-5 rounded" />
          </label>
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Default Actions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Inbound Default</label>
              <select value={form.inbound_default_action} onChange={(e: any) => setForm({ ...form, inbound_default_action: e.target.value })} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
                <option value="quarantine">Quarantine + Notify Recipient</option>
                <option value="allow">Allow</option>
                <option value="bounce">Bounce</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Outbound Default</label>
              <select value={form.outbound_default_action} onChange={(e: any) => setForm({ ...form, outbound_default_action: e.target.value })} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
                <option value="bounce">Bounce to Sender</option>
                <option value="allow">Allow</option>
                <option value="quarantine">Quarantine</option>
              </select>
            </div>
          </div>
          <label className="flex items-center justify-between cursor-pointer">
            <div><p className="text-sm font-medium">Notify recipient on quarantine</p><p className="text-xs text-gray-500">Send notification email when inbound is quarantined</p></div>
            <input type="checkbox" checked={form.notify_recipient_on_quarantine} onChange={(e: any) => setForm({ ...form, notify_recipient_on_quarantine: e.target.checked })} className="w-5 h-5 rounded" />
          </label>
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Custom Messages</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><label className="text-xs text-gray-500 mb-1 block">Quarantine Message</label>
            <Input value={form.quarantine_message || ''} onChange={(e: any) => setForm({ ...form, quarantine_message: e.target.value })} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Bounce Message</label>
            <Input value={form.bounce_message || ''} onChange={(e: any) => setForm({ ...form, bounce_message: e.target.value })} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Description / Notes</label>
            <Input value={form.description || ''} onChange={(e: any) => setForm({ ...form, description: e.target.value })} placeholder="e.g. CCB Group policy" /></div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="bg-blue-600 hover:bg-blue-700">
          {saveMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Settings
        </Button>
      </div>
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
      const body: any = { message_id: 'test-' + Date.now(), direction: form.direction, sender: form.sender, recipients: form.recipients.split(',').map((s: string) => s.trim()).filter(Boolean), subject: form.subject, audit: form.audit };
      if (form.attachment_protected !== '') body.attachments = [{ filename: 'test.xlsx', password_protected: form.attachment_protected === 'true' ? true : form.attachment_protected === 'false' ? false : null }];
      setResult(await apiFetch('/evaluate', { method: 'POST', body: JSON.stringify(body) }));
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  const actionColor: Record<string, string> = { ALLOW: 'success', QUARANTINE: 'warning', BOUNCE: 'danger' };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Test policy decisions without affecting live mail.</p>
      <Card><CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500 mb-1 block">Direction</label>
            <select value={form.direction} onChange={(e: any) => setForm({ ...form, direction: e.target.value })} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
              <option value="INBOUND">INBOUND (external → internal)</option>
              <option value="OUTBOUND">OUTBOUND (internal → external)</option>
            </select>
          </div>
          <div><label className="text-xs text-gray-500 mb-1 block">Sender</label><Input placeholder="sender@example.com" value={form.sender} onChange={(e: any) => setForm({ ...form, sender: e.target.value })} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Recipients</label><Input placeholder="user@idn.ccb.com" value={form.recipients} onChange={(e: any) => setForm({ ...form, recipients: e.target.value })} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Subject</label><Input placeholder="Test email" value={form.subject} onChange={(e: any) => setForm({ ...form, subject: e.target.value })} /></div>
          <div><label className="text-xs text-gray-500 mb-1 block">Attachment</label>
            <select value={form.attachment_protected} onChange={(e: any) => setForm({ ...form, attachment_protected: e.target.value })} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
              <option value="">No attachment</option>
              <option value="true">Password protected</option>
              <option value="false">NOT protected</option>
              <option value="null">Inspection failed</option>
            </select>
          </div>
          <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.audit} onChange={(e: any) => setForm({ ...form, audit: e.target.checked })} className="rounded" /><span className="text-sm">Save to audit log</span></label></div>
        </div>
        <Button onClick={run} disabled={loading || !form.sender || !form.recipients} className="bg-blue-600 hover:bg-blue-700">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}Evaluate Policy
        </Button>
      </CardContent></Card>
      {result && (
        <Card className={result.action === 'ALLOW' ? 'border-green-200' : result.action === 'QUARANTINE' ? 'border-yellow-200' : 'border-red-200'}>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-3">
            <Badge variant={(actionColor[result.action] || 'default') as any} className="text-sm px-3 py-1">{result.action}</Badge>
            <span className="text-gray-600 font-normal text-sm">{result.reason_code}</span>
          </CardTitle></CardHeader>
          <CardContent><div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Direction:</span> <strong>{result.direction}</strong></div>
            <div><span className="text-gray-500">Rule:</span> <code className="text-xs bg-gray-100 px-1 rounded">{result.matched_rule}</code></div>
            <div><span className="text-gray-500">Notify:</span> <strong>{result.notify_recipient ? 'Yes' : 'No'}</strong></div>
            <div><span className="text-gray-500">Bounce:</span> <strong>{result.bounce_sender ? 'Yes' : 'No'}</strong></div>
          </div></CardContent>
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
      <div className="flex items-center justify-between"><p className="text-sm text-gray-500">Policy evaluation audit trail.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}><Loader2 className="w-4 h-4 mr-1" />Refresh</Button></div>
      <Card><CardContent className="p-0">
        {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> :
          (data as any[]).length === 0 ? <div className="py-8 text-center text-gray-400 text-sm">No audit entries yet.</div> :
          <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Dir</TableHead><TableHead>Sender</TableHead><TableHead>Rule</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
            <TableBody>{(data as any[]).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString('id-ID')}</TableCell>
                <TableCell><Badge variant={r.direction === 'INBOUND' ? 'info' : 'default'} className="text-xs">{r.direction}</Badge></TableCell>
                <TableCell className="text-sm font-mono">{r.sender}</TableCell>
                <TableCell className="text-xs text-gray-500 max-w-xs truncate">{r.matched_rule}</TableCell>
                <TableCell><Badge variant={(actionColor[r.action] || 'default') as any}>{r.action}</Badge></TableCell>
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
      {tab === 'settings' && <SettingsTab />}
      {tab === 'test' && <TestTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
