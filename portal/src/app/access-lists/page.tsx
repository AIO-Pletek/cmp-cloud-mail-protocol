'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table';
import {
  ShieldCheck, ShieldX, Plus, Trash2, RefreshCw, Loader2,
  CheckCircle, XCircle, Globe, Mail, Network, ToggleLeft, ToggleRight
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function AccessListsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'white' | 'block'>('block');
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState({ entry_type: 'email', value: '', reason: '' });

  const { data: entries, isLoading, refetch } = useQuery({
    queryKey: ['access-lists', tab],
    queryFn: () => cmpApi.accessLists.list({ list_type: tab }),
  });

  const { data: stats } = useQuery({
    queryKey: ['access-lists-stats'],
    queryFn: () => cmpApi.accessLists.stats(),
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => cmpApi.accessLists.add(data),
    onSuccess: () => {
      toast.success('Entry added');
      queryClient.invalidateQueries({ queryKey: ['access-lists'] });
      queryClient.invalidateQueries({ queryKey: ['access-lists-stats'] });
      setShowAdd(false);
      setNewEntry({ entry_type: 'email', value: '', reason: '' });
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to add'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => cmpApi.accessLists.remove(id),
    onSuccess: () => {
      toast.success('Entry deleted');
      queryClient.invalidateQueries({ queryKey: ['access-lists'] });
      queryClient.invalidateQueries({ queryKey: ['access-lists-stats'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      cmpApi.accessLists.toggle(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-lists'] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => cmpApi.accessLists.sync(),
    onSuccess: (data: any) => {
      toast.success('Synced to Rspamd/Postfix');
    },
  });

  const handleAdd = () => {
    if (!newEntry.value.trim()) {
      toast.error('Value is required');
      return;
    }
    addMutation.mutate({ list_type: tab, ...newEntry });
  };

  const items = entries || [];
  const filteredItems = items.filter((e: any) => e.list_type === tab);

  const getEntryTypeIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="w-4 h-4 text-blue-500" />;
      case 'domain': return <Globe className="w-4 h-4 text-green-500" />;
      case 'ip': return <Network className="w-4 h-4 text-purple-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Whitelist & Blocklist</h2>
          <p className="text-sm text-gray-500 mt-1">Manage allowed and blocked senders per domain</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()}>
            {syncMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Sync to Server
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats?.total || 0}</p>
            <p className="text-xs text-gray-500">Total Rules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{stats?.whitelist || 0}</p>
            <p className="text-xs text-gray-500">Whitelisted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats?.blocklist || 0}</p>
            <p className="text-xs text-gray-500">Blocked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {(stats?.by_type || []).filter((t: any) => t.entry_type === 'domain').reduce((a: number, b: any) => a + b.count, 0)}
            </p>
            <p className="text-xs text-gray-500">Domains</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('block')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'block' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <ShieldX className="w-4 h-4" /> Blocklist ({stats?.blocklist || 0})
        </button>
        <button
          onClick={() => setTab('white')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'white' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" /> Whitelist ({stats?.whitelist || 0})
        </button>
      </div>

      {/* Add Form */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">
              {tab === 'block' ? 'Block Sender / Domain / IP' : 'Allow Sender / Domain / IP'}
            </span>
            <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
              <Plus className="w-4 h-4 mr-1" /> {showAdd ? 'Cancel' : 'Add Entry'}
            </Button>
          </div>
          {showAdd && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Type</label>
                <select
                  value={newEntry.entry_type}
                  onChange={e => setNewEntry(n => ({ ...n, entry_type: e.target.value }))}
                  className="w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
                >
                  <option value="email">Email Address</option>
                  <option value="domain">Domain</option>
                  <option value="ip">IP Address</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Value</label>
                <Input
                  placeholder={
                    newEntry.entry_type === 'email' ? 'user@domain.com' :
                    newEntry.entry_type === 'domain' ? 'example.com' :
                    '192.168.1.100'
                  }
                  value={newEntry.value}
                  onChange={e => setNewEntry(n => ({ ...n, value: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Reason (optional)</label>
                <Input
                  placeholder="Why block/allow?"
                  value={newEntry.reason}
                  onChange={e => setNewEntry(n => ({ ...n, reason: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleAdd}
                  disabled={addMutation.isPending}
                  className={`h-9 w-full ${tab === 'block' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                  {tab === 'block' ? 'Block' : 'Allow'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              {tab === 'block' ? <ShieldX className="w-12 h-12 mb-3 opacity-30" /> : <ShieldCheck className="w-12 h-12 mb-3 opacity-30" />}
              <p className="text-lg font-medium">No {tab === 'block' ? 'blocked' : 'whitelisted'} entries</p>
              <p className="text-sm mt-1">Click "Add Entry" to add one</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{getEntryTypeIcon(item.entry_type)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.entry_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.value}</TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">{item.reason || '-'}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleMutation.mutate({ id: item.id, enabled: !item.enabled })}
                        className="flex items-center gap-1"
                      >
                        {item.enabled ? (
                          <><ToggleRight className="w-5 h-5 text-green-500" /> <span className="text-xs text-green-600">Active</span></>
                        ) : (
                          <><ToggleLeft className="w-5 h-5 text-gray-400" /> <span className="text-xs text-gray-400">Disabled</span></>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{formatDate(item.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(item.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
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
