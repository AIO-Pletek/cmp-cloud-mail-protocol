'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table';
import {
  RefreshCw, Trash2, Play, Pause, Search, Mail, AlertTriangle,
  Send, Clock, CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function QueuePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const { data: queueData, isLoading, refetch } = useQuery({
    queryKey: ['queue'],
    queryFn: () => cmpApi.queue.list(),
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: () => cmpApi.queue.stats(),
    refetchInterval: 10000,
  });

  const flushAll = useMutation({
    mutationFn: () => cmpApi.queue.flush(),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Queue flushed');
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: () => toast.error('Failed to flush queue'),
  });

  const flushOne = useMutation({
    mutationFn: (id: string) => cmpApi.queue.flushOne(id),
    onSuccess: () => {
      toast.success('Message flushed');
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: () => toast.error('Failed to flush message'),
  });

  const holdMsg = useMutation({
    mutationFn: (id: string) => cmpApi.queue.hold(id),
    onSuccess: () => {
      toast.success('Message put on hold');
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: () => toast.error('Failed to hold message'),
  });

  const releaseMsg = useMutation({
    mutationFn: (id: string) => cmpApi.queue.release(id),
    onSuccess: () => {
      toast.success('Message released');
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: () => toast.error('Failed to release message'),
  });

  const deleteOne = useMutation({
    mutationFn: (id: string) => cmpApi.queue.deleteOne(id),
    onSuccess: () => {
      toast.success('Message deleted');
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: () => toast.error('Failed to delete message'),
  });

  const deleteAll = useMutation({
    mutationFn: () => cmpApi.queue.deleteAll(),
    onSuccess: (data: any) => {
      toast.success(data.message || 'All messages deleted');
      setConfirmDeleteAll(false);
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: () => toast.error('Failed to delete all'),
  });

  const items = queueData?.items || [];
  const filtered = items.filter((item: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.queue_id?.toLowerCase().includes(q) ||
      item.sender?.toLowerCase().includes(q) ||
      item.recipients?.some((r: string) => r.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge variant="success">Active</Badge>;
      case 'hold': return <Badge variant="warning">Hold</Badge>;
      case 'deferred': return <Badge variant="info">Deferred</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Mail Queue</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor and manage outgoing mail queue</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => flushAll.mutate()} disabled={flushAll.isPending}>
            <Send className="w-4 h-4 mr-1" /> Flush All
          </Button>
          {confirmDeleteAll ? (
            <div className="flex items-center gap-1">
              <Button variant="destructive" size="sm" onClick={() => deleteAll.mutate()}>
                Confirm Delete All
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteAll(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setConfirmDeleteAll(true)} disabled={items.length === 0}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete All
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total in Queue</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.total || 0}</p>
              </div>
              <Mail className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats?.active || 0}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Deferred</p>
                <p className="text-2xl font-bold text-yellow-600">{stats?.deferred || 0}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">On Hold</p>
                <p className="text-2xl font-bold text-red-600">{stats?.hold || 0}</p>
              </div>
              <Pause className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by ID, sender, or recipient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="text-sm text-gray-500">{filtered.length} messages</span>
      </div>

      {/* Queue Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Mail className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">Queue is empty</p>
              <p className="text-sm">No messages in the mail queue</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Queue ID</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item: any) => (
                  <TableRow key={item.queue_id}>
                    <TableCell className="font-mono text-xs">{item.queue_id}</TableCell>
                    <TableCell className="text-sm">{item.sender || '-'}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">
                      {item.recipients?.join(', ') || '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell className="text-sm text-gray-500">{item.size || '-'}</TableCell>
                    <TableCell className="text-sm text-gray-500">{item.time || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.status === 'hold' ? (
                          <Button variant="ghost" size="icon" title="Release"
                            onClick={() => releaseMsg.mutate(item.queue_id)}>
                            <Play className="w-4 h-4 text-green-600" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" title="Hold"
                            onClick={() => holdMsg.mutate(item.queue_id)}>
                            <Pause className="w-4 h-4 text-yellow-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Flush now"
                          onClick={() => flushOne.mutate(item.queue_id)}>
                          <Send className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Delete"
                          onClick={() => deleteOne.mutate(item.queue_id)}>
                          <Trash2 className="w-4 h-4 text-red-600" />
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
    </div>
  );
}
