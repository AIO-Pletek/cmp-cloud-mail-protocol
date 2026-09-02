'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { FilterRule } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function FiltersPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    domainId: '',
    ruleType: 'blacklist' as 'whitelist' | 'blacklist' | 'content',
    matchType: 'exact' as 'exact' | 'regex' | 'contains',
    pattern: '',
    action: 'block' as 'allow' | 'block' | 'quarantine',
    description: '',
  });

  const { data: filters, isLoading } = useQuery({
    queryKey: ['filters'],
    queryFn: () => cmpApi.filters.list(),
  });

  const { data: domains } = useQuery({
    queryKey: ['domains'],
    queryFn: () => cmpApi.domains.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<FilterRule>) => cmpApi.filters.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filters'] });
      setAddOpen(false);
      resetForm();
      toast.success('Filter rule created');
    },
    onError: () => toast.error('Failed to create filter rule'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cmpApi.filters.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filters'] });
      setDeleteId(null);
      toast.success('Filter rule deleted');
    },
    onError: () => toast.error('Failed to delete filter rule'),
  });

  const resetForm = () => {
    setForm({ domainId: '', ruleType: 'blacklist', matchType: 'exact', pattern: '', action: 'block', description: '' });
  };

  const handleSubmit = () => {
    if (!form.pattern) {
      toast.error('Pattern is required');
      return;
    }
    createMutation.mutate(form);
  };

  const getDomainName = (domainId: string) => {
    return domains?.find((d) => d.id === domainId)?.domainName || domainId;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Filter Rules</h2>
          <p className="text-sm text-gray-500 mt-1">Manage whitelist, blacklist, and content filter rules</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Rule
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pattern</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                  </TableCell>
                </TableRow>
              ) : filters && filters.length > 0 ? (
                filters.map((filter: any) => (
                  <TableRow key={filter.id}>
                    <TableCell className="font-mono text-sm">{filter.pattern}</TableCell>
                    <TableCell>
                      <Badge variant={filter.ruleType === 'whitelist' ? 'success' : filter.ruleType === 'blacklist' ? 'danger' : 'info'}>
                        {filter.ruleType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">{filter.matchType}</TableCell>
                    <TableCell>
                      <Badge variant={filter.action === 'allow' ? 'success' : filter.action === 'block' ? 'danger' : 'warning'}>
                        {filter.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">{getDomainName(filter.domainId)}</TableCell>
                    <TableCell>
                      <Badge variant={filter.isActive ? 'success' : 'outline'}>
                        {filter.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setEditId(filter.id); setForm({ ...form, ...(filter as any) }); setAddOpen(true); }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(filter.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                    No filter rules configured yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) { setEditId(null); resetForm(); } setAddOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Filter Rule' : 'Add Filter Rule'}</DialogTitle>
            <DialogDescription>Configure a new email filtering rule.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Domain</label>
              <Select value={form.domainId} onValueChange={(v) => setForm({ ...form, domainId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select domain (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {domains?.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.domainName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Rule Type</label>
              <Select value={form.ruleType} onValueChange={(v) => setForm({ ...form, ruleType: v as 'whitelist' | 'blacklist' | 'content' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whitelist">Whitelist</SelectItem>
                  <SelectItem value="blacklist">Blacklist</SelectItem>
                  <SelectItem value="content">Content</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Match Type</label>
              <Select value={form.matchType} onValueChange={(v) => setForm({ ...form, matchType: v as 'exact' | 'regex' | 'contains' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exact</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                  <SelectItem value="contains">Contains</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input label="Pattern" placeholder="user@example.com or keyword" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Action</label>
              <Select value={form.action} onValueChange={(v) => setForm({ ...form, action: v as 'allow' | 'block' | 'quarantine' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="quarantine">Quarantine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input label="Description" placeholder="Optional description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setEditId(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editId ? 'Update' : 'Create'} Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Filter Rule</DialogTitle>
            <DialogDescription>Are you sure you want to delete this filter rule? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
