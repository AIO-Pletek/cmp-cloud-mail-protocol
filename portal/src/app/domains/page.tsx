'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Domain } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, CheckCircle, XCircle, Trash2, Shield, Globe, Loader2 } from 'lucide-react';
import { formatDate, formatNumber } from '@/lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function DomainsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: domains, isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: () => cmpApi.domains.list(),
  });

  const createMutation = useMutation({
    mutationFn: (domain: string) => cmpApi.domains.create(domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setAddOpen(false);
      setNewDomain('');
      toast.success('Domain added successfully');
    },
    onError: () => toast.error('Failed to add domain'),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => cmpApi.domains.verify(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success('Domain verified');
    },
    onError: () => toast.error('Verification failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cmpApi.domains.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setDeleteId(null);
      toast.success('Domain deleted');
    },
    onError: () => toast.error('Failed to delete domain'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Domains</h2>
          <p className="text-sm text-gray-500 mt-1">Manage your mail domains and DNS configuration</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Domain
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Emails</TableHead>
                <TableHead className="text-right">Spam Blocked</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                  </TableCell>
                </TableRow>
              ) : domains && domains.length > 0 ? (
                domains.map((domain: Domain) => (
                  <TableRow key={domain.id}>
                    <TableCell>
                      <Link href={`/domains/${domain.id}`} className="font-medium text-primary-600 hover:text-primary-700 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-gray-400" />
                        {domain.domainName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={domain.isVerified ? 'success' : 'warning'}>
                        {domain.isVerified ? 'Verified' : 'Pending'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(domain.emailCount)}</TableCell>
                    <TableCell className="text-right">{formatNumber(domain.spamBlocked)}</TableCell>
                    <TableCell className="text-gray-500">{formatDate(domain.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!domain.isVerified && (
                          <Button variant="ghost" size="sm" onClick={() => verifyMutation.mutate(domain.id)} disabled={verifyMutation.isPending}>
                            <Shield className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(domain.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                    No domains configured yet. Add your first domain to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Domain Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Domain</DialogTitle>
            <DialogDescription>Add a new mail domain to configure with CMP Gateway.</DialogDescription>
          </DialogHeader>
          <Input
            label="Domain Name"
            placeholder="example.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(newDomain)} disabled={createMutation.isPending || !newDomain}>
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Add Domain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Domain</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this domain? This action cannot be undone and all associated data will be removed.
            </DialogDescription>
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
