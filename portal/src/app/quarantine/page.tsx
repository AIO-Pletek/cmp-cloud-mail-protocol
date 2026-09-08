'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { QuarantineItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ShieldCheck, Trash2, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function QuarantinePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['quarantine', search, statusFilter],
    queryFn: () => cmpApi.quarantine.list({ search, status: statusFilter === 'all' ? undefined : statusFilter }),
  });

  const { data: stats } = useQuery({
    queryKey: ['quarantine-stats'],
    queryFn: () => cmpApi.quarantine.stats(),
  });

  const releaseMutation = useMutation({
    mutationFn: (id: string) => cmpApi.quarantine.release(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarantine'] });
      toast.success('Email released');
    },
    onError: () => toast.error('Failed to release email'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cmpApi.quarantine.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarantine'] });
      toast.success('Email deleted');
    },
    onError: () => toast.error('Failed to delete email'),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ action, ids }: { action: 'release' | 'delete'; ids: string[] }) => cmpApi.quarantine.bulk(action, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quarantine'] });
      setSelected([]);
      toast.success('Bulk action completed');
    },
    onError: () => toast.error('Bulk action failed'),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (!data?.items) return;
    if (selected.length === data.items.length) {
      setSelected([]);
    } else {
      setSelected(data.items.map((item: any) => (i: any) => i.id));
    }
  };

  const items = data?.items || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Quarantine</h2>
        <p className="text-sm text-gray-500 mt-1">Review and manage quarantined emails</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-900' },
            { label: 'Pending', value: stats.pending, color: 'text-yellow-600' },
            { label: 'Released', value: stats.released, color: 'text-green-600' },
            { label: 'Deleted', value: stats.deleted, color: 'text-red-600' },
            { label: 'Expired', value: stats.expired, color: 'text-gray-500' },
          ].map((s: any) => (
            <Card key={s.label}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by sender, recipient, or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="released">Released</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary-50 border border-primary-200 rounded-lg">
          <span className="text-sm font-medium text-primary-700">{selected.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ action: 'release', ids: selected })} disabled={bulkMutation.isPending}>
            <ShieldCheck className="w-4 h-4 mr-1" /> Release
          </Button>
          <Button size="sm" variant="destructive" onClick={() => bulkMutation.mutate({ action: 'delete', ids: selected })} disabled={bulkMutation.isPending}>
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input type="checkbox" checked={selected.length === items.length && items.length > 0} onChange={toggleSelectAll} className="rounded" />
                </TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="text-center">Spam Score</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                  </TableCell>
                </TableRow>
              ) : items.length > 0 ? (
                items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelect(item.id)} className="rounded" />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.sender}</TableCell>
                    <TableCell className="font-mono text-xs">{item.recipient}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{item.subject}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-medium ${item.spamScore >= 8 ? 'text-red-600' : item.spamScore >= 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {item.spamScore.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[150px] truncate">{item.reason}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'pending' ? 'warning' : item.status === 'released' ? 'success' : 'danger'}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{formatDate(item.createdAt, 'relative')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.status === 'pending' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => releaseMutation.mutate(item.id)} title="Release">
                              <ShieldCheck className="w-4 h-4 text-green-500" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(item.id)} title="Delete">
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-gray-500">
                    No quarantined emails found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
