'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Shield, CheckCircle, XCircle, Clock, Globe, Mail, Loader2, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('cmp_access_token') || '' : ''; }
const H = () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() });
const apiFetch = async (path: string, opts: RequestInit = {}) => {
  const r = await fetch('/api/v1/policy' + path, { headers: H() as any, ...opts });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || r.statusText);
  return data;
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  expired: 'bg-gray-100 text-gray-600 border-gray-200',
};

function formatDate(dt: string) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

export default function DomainApprovalsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('pending');
  const [addToAllowlist, setAddToAllowlist] = useState<Record<string, boolean>>({});

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['domain-approvals', filter],
    queryFn: () => apiFetch('/domain-approvals' + (filter ? `?status=${filter}` : '')),
    refetchInterval: 30_000,
  });

  const approveMut = useMutation({
    mutationFn: ({ id, add }: { id: string; add: boolean }) =>
      apiFetch(`/domain-approvals/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ add_to_allowlist: add }),
      }),
    onSuccess: (_, vars) => {
      toast.success(vars.add ? 'Approved & added to allowlist' : 'Email approved and released');
      qc.invalidateQueries({ queryKey: ['domain-approvals'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/domain-approvals/${id}/reject`, { method: 'POST' }),
    onSuccess: () => { toast.success('Email rejected and deleted from queue'); qc.invalidateQueries({ queryKey: ['domain-approvals'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const pending = (data as any[]).filter((r: any) => r.status === 'pending').length;

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/" className="flex items-center gap-1 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Home
        </Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">Domain Approvals</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Domain Approvals</h2>
              <p className="text-sm text-gray-500 mt-0.5">Emails from unlisted domains held for review</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pending > 0 && (
            <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5">
              <Clock className="w-4 h-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-800">{pending} pending</span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" />Refresh
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {['pending', 'approved', 'rejected', ''].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={"px-4 py-2 rounded-lg text-sm font-medium transition-colors " +
              (filter === s ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading approvals...
            </div>
          ) : (data as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <CheckCircle className="w-12 h-12 mb-3 text-green-300" />
              <p className="font-medium">No {filter || ''} approval requests</p>
              <p className="text-sm mt-1">Emails from unlisted domains will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data as any[]).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[r.status] || STATUS_COLORS.expired}`}>
                        {r.status === 'pending' && <Clock className="w-3 h-3" />}
                        {r.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                        {r.status === 'rejected' && <XCircle className="w-3 h-3" />}
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.direction === 'INBOUND' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {r.direction === 'INBOUND' ? '← Inbound' : '→ Outbound'}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate text-sm">{r.sender}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.sender_domain}</code>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <span className="truncate text-sm">{r.recipient}</span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(r.created_at)}
                    </TableCell>
                    <TableCell>
                      {r.status === 'pending' ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                            <input type="checkbox"
                              checked={!!addToAllowlist[r.id]}
                              onChange={e => setAddToAllowlist(prev => ({ ...prev, [r.id]: e.target.checked }))}
                              className="rounded" />
                            Add to allowlist
                          </label>
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                            disabled={approveMut.isPending}
                            onClick={() => approveMut.mutate({ id: r.id, add: !!addToAllowlist[r.id] })}>
                            <CheckCircle className="w-3 h-3 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="outline"
                            className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                            disabled={rejectMut.isPending}
                            onClick={() => rejectMut.mutate(r.id)}>
                            <XCircle className="w-3 h-3 mr-1" />Reject
                          </Button>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">
                          {r.actioned_by && <span>by {r.actioned_by}</span>}
                          {r.actioned_at && <span className="ml-1">· {formatDate(r.actioned_at)}</span>}
                          {r.add_to_allowlist && <span className="ml-1 text-green-600">· added to allowlist</span>}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Info box */}
      <Card className="border-blue-100 bg-blue-50">
        <CardContent className="py-4 px-5">
          <p className="text-sm text-blue-800 font-medium mb-1">How domain approvals work</p>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>Emails from domains not in your allowlist are automatically held in queue</li>
            <li>You receive an email notification with one-click approve/reject links</li>
            <li>Approve releases the email to the recipient's inbox</li>
            <li>Reject permanently deletes the email from queue</li>
            <li>Check "Add to allowlist" to automatically allow future emails from this domain</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
