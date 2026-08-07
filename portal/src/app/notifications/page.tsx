'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Bell, Mail, Plus, Trash2, Loader2, ExternalLink, ToggleLeft, ToggleRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'alerts' | 'webhooks'>('alerts');
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newHook, setNewHook] = useState({ url: '', events: ['email.sent'] });
  const [newAlert, setNewAlert] = useState({ email: '', events: ['email.bounced', 'virus.detected'], domain: '', label: '' });

  const { data: hooks } = useQuery({ queryKey: ['webhooks'], queryFn: () => cmpApi.webhooks.list(), enabled: tab === 'webhooks' });
  const { data: hookEvents } = useQuery({ queryKey: ['webhook-events'], queryFn: () => cmpApi.webhooks.events() });
  const { data: alerts } = useQuery({ queryKey: ['email-alerts'], queryFn: () => cmpApi.alerts.list(), enabled: tab === 'alerts' });
  const { data: alertEvents } = useQuery({ queryKey: ['alert-events'], queryFn: () => cmpApi.alerts.events() });

  const addHookMut = useMutation({ mutationFn: (d: any) => cmpApi.webhooks.add(d), onSuccess: () => { toast.success('Webhook added'); queryClient.invalidateQueries({ queryKey: ['webhooks'] }); setShowAddWebhook(false); }});
  const delHookMut = useMutation({ mutationFn: (id: string) => cmpApi.webhooks.remove(id), onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['webhooks'] }); }});
  const testHookMut = useMutation({ mutationFn: (id: string) => cmpApi.webhooks.test(id), onSuccess: () => toast.success('Test sent!')});

  const addAlertMut = useMutation({ mutationFn: (d: any) => cmpApi.alerts.add(d), onSuccess: () => { toast.success('Alert added'); queryClient.invalidateQueries({ queryKey: ['email-alerts'] }); setShowAddAlert(false); setNewAlert({ email: '', events: ['email.bounced', 'virus.detected'], domain: '', label: '' }); }});
  const delAlertMut = useMutation({ mutationFn: (id: string) => cmpApi.alerts.remove(id), onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['email-alerts'] }); }});
  const toggleAlertMut = useMutation({ mutationFn: ({ id, enabled }: any) => cmpApi.alerts.toggle(id, enabled), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['email-alerts'] })});

  const hookItems = hooks || [];
  const alertItems = alerts || [];
  const allHookEvents = hookEvents || ['email.sent', 'email.bounced', 'email.rejected', 'email.deferred', 'spam.detected', 'virus.detected'];
  const allAlertEvents = alertEvents || ['email.bounced', 'email.rejected', 'email.deferred', 'spam.detected', 'virus.detected', 'quota.warning', 'queue.full', 'daily.summary'];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
        <p className="text-sm text-gray-500">Configure webhooks and email alerts for email events</p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('alerts')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${tab === 'alerts' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          <Mail className="w-4 h-4" /> Email Alerts ({alertItems.length})
        </button>
        <button onClick={() => setTab('webhooks')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${tab === 'webhooks' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          <Bell className="w-4 h-4" /> Webhooks ({hookItems.length})
        </button>
      </div>

      {tab === 'alerts' && (<>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div><span className="text-sm font-medium text-gray-700">Email Alert Recipients</span><p className="text-xs text-gray-500">Send email notifications when events occur</p></div>
            <Button size="sm" onClick={() => setShowAddAlert(!showAddAlert)}><Plus className="w-4 h-4 mr-1" />{showAddAlert ? 'Cancel' : 'Add Alert'}</Button>
          </div>
          {showAddAlert && (<div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t">
            <div><label className="text-xs text-gray-500 mb-1 block">Email</label><Input placeholder="client@example.com" value={newAlert.email} onChange={e => setNewAlert(n => ({...n, email: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Label</label><Input placeholder="Client ABC" value={newAlert.label} onChange={e => setNewAlert(n => ({...n, label: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Domain filter</label><Input placeholder="example.com" value={newAlert.domain} onChange={e => setNewAlert(n => ({...n, domain: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Events</label>
              <div className="flex flex-wrap gap-1">{allAlertEvents.map((ev: any) => { const val = typeof ev === 'string' ? ev : ev.value; const lbl = typeof ev === 'string' ? ev : ev.label;
                return (<button key={val} onClick={() => setNewAlert(n => ({...n, events: n.events.includes(val) ? n.events.filter(e => e !== val) : [...n.events, val]}))}
                  className={`px-1.5 py-0.5 text-[10px] rounded ${newAlert.events.includes(val) ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-gray-100 text-gray-500'}`}>{lbl}</button>);})}
              </div>
            </div>
            <div className="md:col-span-4"><Button onClick={() => newAlert.email && addAlertMut.mutate(newAlert)} disabled={addAlertMut.isPending} className="bg-blue-600 hover:bg-blue-700">{addAlertMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}Create Alert</Button></div>
          </div>)}
        </CardContent></Card>
        <Card><CardContent className="p-0">
          {alertItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400"><Mail className="w-12 h-12 mb-3 opacity-30" /><p className="text-lg font-medium">No email alerts</p><p className="text-sm">Add an alert to notify clients</p></div>
          ) : (
            <Table><TableHeader><TableRow><TableHead>Recipient</TableHead><TableHead>Events</TableHead><TableHead>Domain</TableHead><TableHead>Status</TableHead><TableHead>Added</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{alertItems.map((a: any) => (
              <TableRow key={a.id}>
                <TableCell><div className="font-medium">{a.label || a.email}</div><div className="text-xs text-gray-500">{a.email}</div></TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{(a.events || []).map((ev: string) => <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>)}</div></TableCell>
                <TableCell>{a.domain ? <Badge variant="outline">{a.domain}</Badge> : <span className="text-xs text-gray-400">All</span>}</TableCell>
                <TableCell><button onClick={() => toggleAlertMut.mutate({ id: a.id, enabled: !a.enabled })} className="flex items-center gap-1">{a.enabled !== false ? <><ToggleRight className="w-5 h-5 text-green-500" /><span className="text-xs text-green-600">Active</span></> : <><ToggleLeft className="w-5 h-5 text-gray-400" /><span className="text-xs text-gray-400">Disabled</span></>}</button></TableCell>
                <TableCell className="text-sm text-gray-500">{formatDate(a.created_at)}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => delAlertMut.mutate(a.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button></TableCell>
              </TableRow>
            ))}</TableBody></Table>
          )}
        </CardContent></Card>
      </>)}

      {tab === 'webhooks' && (<>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Webhook Endpoints</span>
            <Button size="sm" onClick={() => setShowAddWebhook(!showAddWebhook)}><Plus className="w-4 h-4 mr-1" />{showAddWebhook ? 'Cancel' : 'Add'}</Button>
          </div>
          {showAddWebhook && (<div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t">
            <div><label className="text-xs text-gray-500 mb-1 block">URL</label><Input placeholder="https://your-server.com/webhook" value={newHook.url} onChange={e => setNewHook(n => ({...n, url: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Events</label>
              <div className="flex flex-wrap gap-2">{allHookEvents.map((ev: string) => (
                <button key={ev} onClick={() => setNewHook(n => ({...n, events: n.events.includes(ev) ? n.events.filter(e => e !== ev) : [...n.events, ev]}))}
                  className={`px-2 py-1 text-xs rounded-md ${newHook.events.includes(ev) ? 'bg-purple-100 text-purple-700 border border-purple-300' : 'bg-gray-100 text-gray-600'}`}>{ev}</button>))}
              </div>
            </div>
            <div className="md:col-span-2"><Button onClick={() => newHook.url && addHookMut.mutate(newHook)} disabled={addHookMut.isPending} className="bg-purple-600 hover:bg-purple-700">{addHookMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Create Webhook</Button></div>
          </div>)}
        </CardContent></Card>
        <Card><CardContent className="p-0">
          {hookItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400"><Bell className="w-12 h-12 mb-3 opacity-30" /><p className="text-lg font-medium">No webhooks</p></div>
          ) : (
            <Table><TableHeader><TableRow><TableHead>URL</TableHead><TableHead>Events</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{hookItems.map((h: any) => (
              <TableRow key={h.id}>
                <TableCell className="font-mono text-sm max-w-[300px] truncate">{h.url}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{(h.events || []).map((ev: string) => <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>)}</div></TableCell>
                <TableCell>{h.enabled !== false ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Disabled</Badge>}</TableCell>
                <TableCell className="text-sm text-gray-500">{formatDate(h.created_at)}</TableCell>
                <TableCell className="text-right"><div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => testHookMut.mutate(h.id)}><ExternalLink className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => delHookMut.mutate(h.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                </div></TableCell>
              </TableRow>
            ))}</TableBody></Table>
          )}
        </CardContent></Card>
      </>)}
    </div>
  );
}