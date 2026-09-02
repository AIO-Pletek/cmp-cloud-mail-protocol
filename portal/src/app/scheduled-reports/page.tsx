'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { BarChart3, Plus, Trash2, Loader2, Send, Mail } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') || '' : ''; }

export default function ScheduledReportsPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState('weekly');

  const { data: reportsRaw, isLoading } = useQuery({
    queryKey: ['scheduled-reports'],
    queryFn: async () => {
      const r = await fetch('/api/v1/scheduled-reports', { headers: { 'Authorization': 'Bearer ' + getToken() } });
      return r.json();
    },
  });
  const reports = Array.isArray(reportsRaw) ? reportsRaw : [];

  const addMut = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/v1/scheduled-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify({ email, frequency }),
      });
      return r.json();
    },
    onSuccess: () => { toast.success('Report scheduled'); qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); setShowAdd(false); setEmail(''); },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      await fetch('/api/v1/scheduled-reports/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + getToken() } });
    },
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); },
  });

  const testMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch('/api/v1/scheduled-reports/' + id + '/test', { method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() } });
      return r.json();
    },
    onSuccess: () => toast.success('Test report sent!'),
    onError: () => toast.error('Failed to send test'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Scheduled Reports</h2>
          <p className="text-sm text-gray-500">Automated email summary reports for clients</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}><Plus className="w-4 h-4 mr-1" />{showAdd ? 'Cancel' : 'Add Report'}</Button>
      </div>

      {showAdd && (
        <Card><CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-500 mb-1 block">Recipient Email</label><Input placeholder="client@example.com" value={email} onChange={(e: any) => setEmail(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">Frequency</label>
              <select value={frequency} onChange={(e: any) => setFrequency(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
                <option value="weekly">Weekly (Monday)</option>
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="flex items-end"><Button onClick={() => email && addMut.mutate()} disabled={addMut.isPending || !email} className="bg-green-600 hover:bg-green-700">
              {addMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}Schedule Report
            </Button></div>
          </div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <BarChart3 className="w-12 h-12 mb-3 opacity-30" /><p className="text-lg font-medium">No scheduled reports</p><p className="text-sm mt-1">Add a report to send automated summaries</p>
          </div>
        ) : (
          <Table><TableHeader><TableRow>
            <TableHead>Recipient</TableHead><TableHead>Frequency</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader><TableBody>
            {reports.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.email}</TableCell>
                <TableCell><Badge variant="outline">{r.frequency || 'weekly'}</Badge></TableCell>
                <TableCell>{r.enabled !== false ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Paused</Badge>}</TableCell>
                <TableCell className="text-sm text-gray-500">{r.created_at ? formatDate(r.created_at) : '-'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => testMut.mutate(r.id)} title="Send test now"><Send className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => delMut.mutate(r.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        )}
      </CardContent></Card>
    </div>
  );
}