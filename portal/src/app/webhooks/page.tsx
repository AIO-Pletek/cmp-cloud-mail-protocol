'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Bell, Plus, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newHook, setNewHook] = useState({ url: '', events: ['email.sent'] });

  const { data: hooks, isLoading } = useQuery({ queryKey: ['webhooks'], queryFn: () => cmpApi.webhooks.list() });
  const { data: events } = useQuery({ queryKey: ['webhook-events'], queryFn: () => cmpApi.webhooks.events() });

  const addMutation = useMutation({
    mutationFn: (data: any) => cmpApi.webhooks.add(data),
    onSuccess: () => { toast.success('Webhook added'); queryClient.invalidateQueries({ queryKey: ['webhooks'] }); setShowAdd(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cmpApi.webhooks.remove(id),
    onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['webhooks'] }); },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => cmpApi.webhooks.test(id),
    onSuccess: () => toast.success('Test sent!'),
  });

  const items = hooks || [];
  const allEvents = events || ['email.sent','email.bounced','email.rejected','email.deferred','spam.detected','virus.detected'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Webhooks</h2>
          <p className="text-sm text-gray-500">Get notified on email events</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">URL</label>
              <Input placeholder="https://your-server.com/webhook" value={newHook.url} onChange={e => setNewHook(n => ({...n, url: e.target.value}))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Events</label>
              <div className="flex flex-wrap gap-2">
                {allEvents.map((ev: string) => (
                  <button key={ev} onClick={() => setNewHook(n => ({...n, events: n.events.includes(ev) ? n.events.filter(e => e !== ev) : [...n.events, ev]}))}
                    className={`px-2 py-1 text-xs rounded-md ${newHook.events.includes(ev) ? 'bg-primary-100 text-primary-700 border border-primary-300' : 'bg-gray-100 text-gray-600'}`}>{ev}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => newHook.url && addMutation.mutate(newHook)} disabled={addMutation.isPending}>
              {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Create
            </Button>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Bell className="w-12 h-12 mb-3 opacity-30" /><p className="text-lg font-medium">No webhooks</p>
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>URL</TableHead><TableHead>Events</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {items.map((h: any) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-sm max-w-[300px] truncate">{h.url}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{(h.events || []).map((ev: string) => <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>)}</div></TableCell>
                  <TableCell>{h.enabled !== false ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Disabled</Badge>}</TableCell>
                  <TableCell className="text-sm text-gray-500">{formatDate(h.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => testMutation.mutate(h.id)}><ExternalLink className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(h.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                    </div>
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