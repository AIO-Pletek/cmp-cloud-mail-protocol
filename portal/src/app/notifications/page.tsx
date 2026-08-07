'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Bell, Mail, Plus, Trash2, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

const ALL_EVENTS = ['email.bounced', 'email.rejected', 'email.deferred', 'spam.detected', 'virus.detected', 'quota.warning', 'queue.full', 'daily.summary'];

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('alerts');
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [label, setLabel] = useState('');
  const [domain, setDomain] = useState('');
  const [events, setEvents] = useState(['email.bounced', 'virus.detected']);

  const { data: alertsRaw, isLoading } = useQuery({
    queryKey: ['email-alerts'],
    queryFn: async () => {
      const r = await fetch('/api/v1/alerts', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('cmp_access_token') } });
      return r.json();
    },
  });
  const alerts = Array.isArray(alertsRaw) ? alertsRaw : [];

  const addMut = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/v1/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('cmp_access_token') },
        body: JSON.stringify({ email, label, domain: domain || null, events }),
      });
      return r.json();
    },
    onSuccess: () => {
      toast.success('Alert added');
      queryClient.invalidateQueries({ queryKey: ['email-alerts'] });
      setShowAdd(false);
      setEmail('');
      setLabel('');
      setDomain('');
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      await fetch('/api/v1/alerts/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('cmp_access_token') },
      });
    },
    onSuccess: () => {
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['email-alerts'] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await fetch('/api/v1/alerts/' + id + '/toggle', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('cmp_access_token') },
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['email-alerts'] }),
  });

  const toggleEvent = (ev: string) => {
    setEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
          <p className="text-sm text-gray-500">Configure email alerts for your clients</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-4 h-4 mr-1" /> {showAdd ? 'Cancel' : 'Add Alert'}
        </Button>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Recipient Email</label>
              <Input placeholder="client@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Label (optional)</label>
              <Input placeholder="Client ABC" value={label} onChange={e => setLabel(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Domain filter (optional)</label>
              <Input placeholder="example.com" value={domain} onChange={e => setDomain(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Events to notify</label>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map(ev => (
                <button key={ev} onClick={() => toggleEvent(ev)}
                  className={`px-2 py-1 text-xs rounded-md border ${events.includes(ev) ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                  {ev}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={() => { if (email) addMut.mutate(); }} disabled={addMut.isPending || !email}>
            {addMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
            Create Alert
          </Button>
        </CardContent></Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Mail className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">No email alerts configured</p>
              <p className="text-sm mt-1">Click &quot;Add Alert&quot; to notify clients about email events</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.label || a.email}</div>
                      <div className="text-xs text-gray-500">{a.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(a.events || []).map((ev: string) => (
                          <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {a.domain ? <Badge variant="outline">{a.domain}</Badge> : <span className="text-xs text-gray-400">All domains</span>}
                    </TableCell>
                    <TableCell>
                      <button onClick={() => toggleMut.mutate({ id: a.id, enabled: !a.enabled })} className="flex items-center gap-1">
                        {a.enabled !== false ? (
                          <><ToggleRight className="w-5 h-5 text-green-500" /><span className="text-xs text-green-600">Active</span></>
                        ) : (
                          <><ToggleLeft className="w-5 h-5 text-gray-400" /><span className="text-xs text-gray-400">Disabled</span></>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{a.created_at ? formatDate(a.created_at) : '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => delMut.mutate(a.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
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
    </div>
  );
}