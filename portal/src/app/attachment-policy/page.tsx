'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Paperclip, Plus, Trash2, Loader2, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') || '' : ''; }
const apiGet = async (url: string) => { const r = await fetch('/api/v1' + url, { headers: { 'Authorization': 'Bearer ' + getToken() } }); return r.json(); };
const apiPost = async (url: string, body: any) => { const r = await fetch('/api/v1' + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }, body: JSON.stringify(body) }); return r.json(); };
const apiDel = async (url: string) => { await fetch('/api/v1' + url, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + getToken() } }); };
const apiPut = async (url: string, body: any) => { await fetch('/api/v1' + url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }, body: JSON.stringify(body) }); };

const ACTIONS = ['block', 'quarantine', 'tag'];

export default function AttachmentPolicyPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'extensions' | 'mime' | 'size'>('extensions');

  // Extension form state
  const [showAddExt, setShowAddExt] = useState(false);
  const [extValue, setExtValue] = useState('');
  const [extListType, setExtListType] = useState<'block' | 'allow'>('block');
  const [extAction, setExtAction] = useState('block');
  const [extDesc, setExtDesc] = useState('');

  // MIME form state
  const [showAddMime, setShowAddMime] = useState(false);
  const [mimeValue, setMimeValue] = useState('');
  const [mimeListType, setMimeListType] = useState<'block' | 'allow'>('block');
  const [mimeAction, setMimeAction] = useState('block');

  // Size form state
  const [showSizeForm, setShowSizeForm] = useState(false);
  const [sizeDomain, setSizeDomain] = useState('');
  const [sizeLimit, setSizeLimit] = useState('');

  // Queries
  const { data: extData, isLoading: extLoading } = useQuery({
    queryKey: ['attachment-policy-extensions'],
    queryFn: () => apiGet('/attachment-policy/extensions'),
    enabled: tab === 'extensions',
  });
  const { data: mimeData, isLoading: mimeLoading } = useQuery({
    queryKey: ['attachment-policy-mime'],
    queryFn: () => apiGet('/attachment-policy/mime-types'),
    enabled: tab === 'mime',
  });
  const { data: sizeData, isLoading: sizeLoading } = useQuery({
    queryKey: ['attachment-policy-size'],
    queryFn: () => apiGet('/attachment-policy/size-limits'),
    enabled: tab === 'size',
  });

  // Extension mutations
  const addExtMut = useMutation({
    mutationFn: () => apiPost('/attachment-policy/extensions', { extension: extValue.replace(/^\./, ''), list_type: extListType, action: extAction, description: extDesc }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attachment-policy-extensions'] }); setShowAddExt(false); setExtValue(''); setExtDesc(''); toast.success('Extension rule added'); },
    onError: () => toast.error('Failed to add extension rule'),
  });
  const delExtMut = useMutation({
    mutationFn: (id: string) => apiDel('/attachment-policy/extensions/' + id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attachment-policy-extensions'] }); toast.success('Extension rule removed'); },
    onError: () => toast.error('Failed to remove rule'),
  });
  const toggleExtMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => apiPut('/attachment-policy/extensions/' + id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachment-policy-extensions'] }),
    onError: () => toast.error('Failed to update rule'),
  });

  // MIME mutations
  const addMimeMut = useMutation({
    mutationFn: () => apiPost('/attachment-policy/mime-types', { mime_type: mimeValue, list_type: mimeListType, action: mimeAction }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attachment-policy-mime'] }); setShowAddMime(false); setMimeValue(''); toast.success('MIME rule added'); },
    onError: () => toast.error('Failed to add MIME rule'),
  });
  const delMimeMut = useMutation({
    mutationFn: (id: string) => apiDel('/attachment-policy/mime-types/' + id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attachment-policy-mime'] }); toast.success('MIME rule removed'); },
    onError: () => toast.error('Failed to remove rule'),
  });
  const toggleMimeMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => apiPut('/attachment-policy/mime-types/' + id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachment-policy-mime'] }),
    onError: () => toast.error('Failed to update rule'),
  });

  // Size mutations
  const addSizeMut = useMutation({
    mutationFn: () => apiPost('/attachment-policy/size-limits', { domain: sizeDomain || null, max_size_mb: Number(sizeLimit) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attachment-policy-size'] }); setShowSizeForm(false); setSizeDomain(''); setSizeLimit(''); toast.success('Size limit updated'); },
    onError: () => toast.error('Failed to update size limit'),
  });
  const delSizeMut = useMutation({
    mutationFn: (id: string) => apiDel('/attachment-policy/size-limits/' + id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attachment-policy-size'] }); toast.success('Size limit removed'); },
    onError: () => toast.error('Failed to remove size limit'),
  });

  // Sync mutation
  const syncMut = useMutation({
    mutationFn: () => apiPost('/attachment-policy/sync', {}),
    onSuccess: () => toast.success('Policy synced to all servers'),
    onError: () => toast.error('Sync failed'),
  });

  const defaults: any[] = extData?.defaults || [];
  const customExts: any[] = extData?.custom || [];
  const mimeDefaults: any[] = mimeData?.defaults || [];
  const customMimes: any[] = mimeData?.custom || [];
  const sizeLimits: any[] = sizeData?.limits || [];

  const tabs = [
    { key: 'extensions', label: 'File Extensions' },
    { key: 'mime', label: 'MIME Types' },
    { key: 'size', label: 'Size Limits' },
  ] as const;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Paperclip className="w-6 h-6 text-primary-600" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Attachment Policy</h1>
            <p className="text-sm text-gray-500">Control which attachments are allowed, blocked, or quarantined.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
          {syncMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Sync Policy
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* TAB 1: File Extensions */}
      {tab === 'extensions' && (
        <>
          {/* System Defaults */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">System Defaults</h2>
              {extLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : defaults.length === 0 ? (
                <p className="text-sm text-gray-400">No system defaults configured.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {defaults.map((d: any, i: number) => (
                    <Badge key={i} variant={d.list_type === 'block' ? 'danger' : 'success'} title={d.action}>
                      .{d.extension}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Custom Rules */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">Custom Rules</h2>
                <Button size="sm" onClick={() => setShowAddExt(!showAddExt)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Rule
                </Button>
              </div>

              {showAddExt && (
                <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Extension</label>
                      <Input placeholder="exe" value={extValue} onChange={e => setExtValue(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">List Type</label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={extListType} onChange={e => setExtListType(e.target.value as any)}>
                        <option value="block">Block</option>
                        <option value="allow">Allow</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Action</label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={extAction} onChange={e => setExtAction(e.target.value)}>
                        {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Description</label>
                      <Input placeholder="Optional note" value={extDesc} onChange={e => setExtDesc(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => addExtMut.mutate()} disabled={!extValue || addExtMut.isPending}>
                      {addExtMut.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddExt(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {extLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : customExts.length === 0 ? (
                <p className="text-sm text-gray-400">No custom extension rules yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Extension</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customExts.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell><Badge variant={r.list_type === 'block' ? 'danger' : 'success'}>.{r.extension}</Badge></TableCell>
                        <TableCell className="capitalize text-sm">{r.list_type}</TableCell>
                        <TableCell className="capitalize text-sm">{r.action}</TableCell>
                        <TableCell className="text-sm text-gray-500">{r.description || '-'}</TableCell>
                        <TableCell>
                          {r.enabled !== false ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Disabled</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => toggleExtMut.mutate({ id: r.id, enabled: !r.enabled })}>
                              {r.enabled !== false ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-600" onClick={() => delExtMut.mutate(r.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* TAB 2: MIME Types */}
      {tab === 'mime' && (
        <>
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">System Defaults</h2>
              {mimeLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : mimeDefaults.length === 0 ? (
                <p className="text-sm text-gray-400">No system defaults configured.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {mimeDefaults.map((d: any, i: number) => (
                    <Badge key={i} variant={d.list_type === 'block' ? 'danger' : 'success'} title={d.action}>
                      {d.mime_type}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">Custom Rules</h2>
                <Button size="sm" onClick={() => setShowAddMime(!showAddMime)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Rule
                </Button>
              </div>

              {showAddMime && (
                <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">MIME Type</label>
                      <Input placeholder="application/zip" value={mimeValue} onChange={e => setMimeValue(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">List Type</label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={mimeListType} onChange={e => setMimeListType(e.target.value as any)}>
                        <option value="block">Block</option>
                        <option value="allow">Allow</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Action</label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={mimeAction} onChange={e => setMimeAction(e.target.value)}>
                        {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => addMimeMut.mutate()} disabled={!mimeValue || addMimeMut.isPending}>
                      {addMimeMut.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddMime(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {mimeLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : customMimes.length === 0 ? (
                <p className="text-sm text-gray-400">No custom MIME rules yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>MIME Type</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customMimes.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell><Badge variant={r.list_type === 'block' ? 'danger' : 'success'}>{r.mime_type}</Badge></TableCell>
                        <TableCell className="capitalize text-sm">{r.list_type}</TableCell>
                        <TableCell className="capitalize text-sm">{r.action}</TableCell>
                        <TableCell>
                          {r.enabled !== false ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Disabled</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => toggleMimeMut.mutate({ id: r.id, enabled: !r.enabled })}>
                              {r.enabled !== false ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-600" onClick={() => delMimeMut.mutate(r.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* TAB 3: Size Limits */}
      {tab === 'size' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Attachment Size Limits</h2>
              <Button size="sm" onClick={() => setShowSizeForm(!showSizeForm)}>
                <Plus className="w-4 h-4 mr-1" /> Set Limit
              </Button>
            </div>

            {showSizeForm && (
              <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Domain (leave blank for global)</label>
                    <Input placeholder="example.com" value={sizeDomain} onChange={e => setSizeDomain(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Max Size (MB)</label>
                    <Input type="number" placeholder="25" min="1" value={sizeLimit} onChange={e => setSizeLimit(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => addSizeMut.mutate()} disabled={!sizeLimit || addSizeMut.isPending}>
                    {addSizeMut.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowSizeForm(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {sizeLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : sizeLimits.length === 0 ? (
              <p className="text-sm text-gray-400">No size limits configured. System default applies.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope</TableHead>
                    <TableHead>Max Size</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sizeLimits.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm font-medium">{s.domain || <span className="text-gray-400 italic">Global</span>}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.max_size_mb} MB</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => delSizeMut.mutate(s.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
