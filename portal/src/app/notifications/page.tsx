'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Bell, Mail, Plus, Trash2, Loader2, ExternalLink, ToggleLeft, ToggleRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

const ALERT_EVENTS = ['email.bounced', 'email.rejected', 'email.deferred', 'spam.detected', 'virus.detected', 'quota.warning', 'queue.full', 'daily.summary'];
const HOOK_EVENTS = ['email.sent', 'email.bounced', 'email.rejected', 'email.deferred', 'spam.detected', 'virus.detected'];

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') || '' : ''; }
const apiGet = async (url: string) => { const r = await fetch('/api/v1' + url, { headers: { 'Authorization': 'Bearer ' + getToken() } }); return r.json(); };
const apiPost = async (url: string, body: any) => { const r = await fetch('/api/v1' + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }, body: JSON.stringify(body) }); return r.json(); };
const apiDel = async (url: string) => { await fetch('/api/v1' + url, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + getToken() } }); };
const apiPut = async (url: string, body: any) => { await fetch('/api/v1' + url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }, body: JSON.stringify(body) }); };

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'alerts' | 'webhooks'>('alerts');
  
  // Alert state
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [alertEmail, setAlertEmail] = useState('');
  const [alertLabel, setAlertLabel] = useState('');
  const [alertDomain, setAlertDomain] = useState('');
  const [alertEvents, setAlertEvents] = useState(['email.bounced', 'virus.detected']);
  
  // Webhook state
  const [showAddHook, setShowAddHook] = useState(false);
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState(['email.sent']);

  // Queries
  const { data: alertsRaw, isLoading: alertsLoading } = useQuery({ queryKey: ['email-alerts'], queryFn: () => apiGet('/alerts'), enabled: tab === 'alerts' });
  const { data: hooksRaw, isLoading: hooksLoading } = useQuery({ queryKey: ['webhooks'], queryFn: () => apiGet('/webhooks'), enabled: tab === 'webhooks' });
  const alerts = Array.isArray(alertsRaw) ? alertsRaw : [];
  const hooks = Array.isArray(hooksRaw) ? hooksRaw : [];

  // Alert mutations
  const addAlertMut = useMutation({
    mutationFn: () => apiPost('/alerts', { email: alertEmail, label: alertLabel, domain: alertDomain || null, events: alertEvents }),
    onSuccess: () => { toast.success('Alert added'); qc.invalidateQueries({ queryKey: ['email-alerts'] }); setShowAddAlert(false); setAlertEmail(''); setAlertLabel(''); setAlertDomain(''); },
    onError: () => toast.error('Failed to add alert'),
  });
  const delAlertMut = useMutation({
    mutationFn: (id: string) => apiDel('/alerts/' + id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['email-alerts'] }); },
  });
  const toggleAlertMut = useMutation({
    mutationFn: ({ id, enabled }: any) => apiPut('/alerts/' + id + '/toggle', { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-alerts'] }),
  });

  // Webhook mutations
  const addHookMut = useMutation({
    mutationFn: () => apiPost('/webhooks', { url: hookUrl, events: hookEvents }),
    onSuccess: () => { toast.success('Webhook added'); qc.invalidateQueries({ queryKey: ['webhooks'] }); setShowAddHook(false); setHookUrl(''); },
    onError: () => toast.error('Failed to add webhook'),
  });
  const delHookMut = useMutation({
    mutationFn: (id: string) => apiDel('/webhooks/' + id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['webhooks'] }); },
  });
  const testHookMut = useMutation({
    mutationFn: (id: string) => apiPost('/webhooks/' + id + '/test', {}),
    onSuccess: () => toast.success('Test event sent!'),
    onError: () => toast.error('Test failed'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
          <p className="text-sm text-gray-500">Email alerts and webhook notifications</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('alerts')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'alerts' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          <Mail className="w-4 h-4" /> Email Alerts ({alerts.length})
        </button>
        <button onClick={() => setTab('webhooks')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'webhooks' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          <Bell className="w-4 h-4" /> Webhooks ({hooks.length})
        </button>
      </div>

      {/* ===== EMAIL ALERTS TAB ===== */}
      {tab === 'alerts' && (<>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-medium text-gray-700">Email Alert Recipients</span>
              <p className="text-xs text-gray-500">Send email notifications when events occur</p>
            </div>
            <Button size="sm" onClick={() => setShowAddAlert(!showAddAlert)}>
              <Plus className="w-4 h-4 mr-1" /> {showAddAlert ? 'Cancel' : 'Add Alert'}
            </Button>
          </div>
          {showAddAlert && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t">
              <div><label className="text-xs text-gray-500 mb-1 block">Recipient Email</label><Input placeholder="client@example.com" value={alertEmail} onChange={e => setAlertEmail(e.target.value)} /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">Label</label><Input placeholder="Client ABC" value={alertLabel} onChange={e => setAlertLabel(e.target.value)} /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">Domain filter (optional)</label><Input placeholder="example.com" value={alertDomain} onChange={e => setAlertDomain(e.target.value)} /></div>
              <div className="md:col-span-3">
                <label className="text-xs text-gray-500 mb-1 block">Events</label>
                <div className="flex flex-wrap gap-2">
                  {ALERT_EVENTS.map(ev => (
                    <button key={ev} onClick={() => setAlertEvents(p => p.includes(ev) ? p.filter(e => e !== ev) : [...p, ev])}
                      className={`px-2 py-1 text-xs rounded-md border ${alertEvents.includes(ev) ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>{ev}</button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-3">
                <Button onClick={() => alertEmail && addAlertMut.mutate()} disabled={addAlertMut.isPending || !alertEmail} className="bg-blue-600 hover:bg-blue-700">
                  {addAlertMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}Create Alert
                </Button>
              </div>
            </div>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-0">
          {alertsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Mail className="w-12 h-12 mb-3 opacity-30" /><p className="text-lg font-medium">No email alerts</p><p className="text-sm mt-1">Add an alert to notify clients</p>
            </div>
          ) : (
            <Table><TableHeader><TableRow>
              <TableHead>Recipient</TableHead><TableHead>Events</TableHead><TableHead>Domain</TableHead><TableHead>Status</TableHead><TableHead>Added</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader><TableBody>
              {alerts.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell><div className="font-medium">{a.label || a.email}</div><div className="text-xs text-gray-500">{a.email}</div></TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{(a.events || []).map((ev: string) => <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>)}</div></TableCell>
                  <TableCell>{a.domain ? <Badge variant="outline">{a.domain}</Badge> : <span className="text-xs text-gray-400">All</span>}</TableCell>
                  <TableCell>
                    <button onClick={() => toggleAlertMut.mutate({ id: a.id, enabled: !a.enabled })} className="flex items-center gap-1">
                      {a.enabled !== false ? <><ToggleRight className="w-5 h-5 text-green-500" /><span className="text-xs text-green-600">Active</span></> : <><ToggleLeft className="w-5 h-5 text-gray-400" /><span className="text-xs text-gray-400">Off</span></>}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{a.created_at ? formatDate(a.created_at) : '-'}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => delAlertMut.mutate(a.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          )}
        </CardContent></Card>
      </>)}

      {/* ===== WEBHOOKS TAB ===== */}
      {tab === 'webhooks' && (<>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-medium text-gray-700">Webhook Endpoints</span>
              <p className="text-xs text-gray-500">POST notifications to your URL</p>
            </div>
            <Button size="sm" onClick={() => setShowAddHook(!showAddHook)}>
              <Plus className="w-4 h-4 mr-1" /> {showAddHook ? 'Cancel' : 'Add Webhook'}
            </Button>
          </div>
          {showAddHook && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t">
              <div><label className="text-xs text-gray-500 mb-1 block">Webhook URL</label><Input placeholder="https://your-server.com/webhook" value={hookUrl} onChange={e => setHookUrl(e.target.value)} /></div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Events</label>
                <div className="flex flex-wrap gap-2">
                  {HOOK_EVENTS.map(ev => (
                    <button key={ev} onClick={() => setHookEvents(p => p.includes(ev) ? p.filter(e => e !== ev) : [...p, ev])}
                      className={`px-2 py-1 text-xs rounded-md border ${hookEvents.includes(ev) ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>{ev}</button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <Button onClick={() => hookUrl && addHookMut.mutate()} disabled={addHookMut.isPending || !hookUrl} className="bg-purple-600 hover:bg-purple-700">
                  {addHookMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Create Webhook
                </Button>
              </div>
            </div>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-0">
          {hooksLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : hooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Bell className="w-12 h-12 mb-3 opacity-30" /><p className="text-lg font-medium">No webhooks</p><p className="text-sm mt-1">Add a webhook to receive POST notifications</p>
            </div>
          ) : (
            <Table><TableHeader><TableRow>
              <TableHead>URL</TableHead><TableHead>Events</TableHead><TableHead>Status</TableHead><TableHead>Added</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader><TableBody>
              {hooks.map((h: any) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-sm max-w-[350px] truncate">{h.url}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{(h.events || []).map((ev: string) => <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>)}</div></TableCell>
                  <TableCell>{h.enabled !== false ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Disabled</Badge>}</TableCell>
                  <TableCell className="text-sm text-gray-500">{h.created_at ? formatDate(h.created_at) : '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => testHookMut.mutate(h.id)} title="Send test"><ExternalLink className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => delHookMut.mutate(h.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          )}
        </CardContent></Card>
      </>)}
    </div>
  );
}