'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table';
import {
  Mail, ArrowUpRight, ArrowDownLeft, RefreshCw, Loader2,
  Download, Calendar, Search, X
} from 'lucide-react';
import { formatDate, formatNumber } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function EmailHistoryPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterDirection, setFilterDirection] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [exportDays, setExportDays] = useState(7);
  const [exporting, setExporting] = useState(false);
  const [searchSender, setSearchSender] = useState('');
  const [searchRecipient, setSearchRecipient] = useState('');
  const [searchDomain, setSearchDomain] = useState('');
  const [activeSearch, setActiveSearch] = useState({ sender: '', recipient: '', domain: '' });

  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['email-logs', page, filterDirection, filterStatus, activeSearch],
    queryFn: () => cmpApi.emailLogs.list({
      page, per_page: 50,
      direction: filterDirection || undefined,
      status: filterStatus || undefined,
      sender: activeSearch.sender || undefined,
      recipient: activeSearch.recipient || undefined,
      domain: activeSearch.domain || undefined,
    }),
  });

  const { data: stats } = useQuery({
    queryKey: ['email-stats'],
    queryFn: () => cmpApi.emailLogs.stats(7),
  });

  const syncMutation = useMutation({
    mutationFn: () => cmpApi.emailLogs.sync(),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Logs synced');
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
      queryClient.invalidateQueries({ queryKey: ['email-stats'] });
    },
  });

  const handleSearch = () => {
    setActiveSearch({ sender: searchSender, recipient: searchRecipient, domain: searchDomain });
    setPage(1);
  };

  const clearSearch = () => {
    setSearchSender(''); setSearchRecipient(''); setSearchDomain('');
    setActiveSearch({ sender: '', recipient: '', domain: '' });
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await cmpApi.emailLogs.export({ days: exportDays, direction: filterDirection || undefined, status: filterStatus || undefined });
      const url = window.URL.createObjectURL(new Blob([blob]));
      const a = document.createElement('a'); a.href = url;
      a.download = `cmp_email_logs_${exportDays}days_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
      toast.success(`Exported ${exportDays} days`);
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  const items = logsData?.items || [];
  const total = logsData?.total || 0;
  const pages = logsData?.pages || 1;
  const hasActiveSearch = activeSearch.sender || activeSearch.recipient || activeSearch.domain;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent': return <Badge variant="success">Delivered</Badge>;
      case 'bounced': return <Badge variant="danger">Bounced</Badge>;
      case 'rejected': return <Badge variant="danger">Rejected</Badge>;
      case 'deferred': return <Badge variant="warning">Deferred</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Email History</h2>
          <p className="text-sm text-gray-500 mt-1">Track all incoming and outgoing email transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()}>
            {syncMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Sync
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{formatNumber(stats?.total || 0)}</p><p className="text-xs text-gray-500">Total (7d)</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-600">{formatNumber(stats?.incoming || 0)}</p><p className="text-xs text-gray-500">Incoming</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{formatNumber(stats?.outgoing || 0)}</p><p className="text-xs text-gray-500">Outgoing</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-600">{formatNumber(stats?.delivered || 0)}</p><p className="text-xs text-gray-500">Delivered</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-600">{formatNumber(stats?.rejected || 0)}</p><p className="text-xs text-gray-500">Rejected</p></CardContent></Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Search</span>
            {hasActiveSearch && (
              <button onClick={clearSearch} className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">From (Sender)</label>
              <Input placeholder="sender@domain.com" value={searchSender} onChange={e => setSearchSender(e.target.value)} onKeyDown={handleKeyDown} className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">To (Recipient)</label>
              <Input placeholder="user@domain.com" value={searchRecipient} onChange={e => setSearchRecipient(e.target.value)} onKeyDown={handleKeyDown} className="h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Domain</label>
              <Input placeholder="example.com" value={searchDomain} onChange={e => setSearchDomain(e.target.value)} onKeyDown={handleKeyDown} className="h-9 text-sm" />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleSearch} className="h-9"><Search className="w-4 h-4 mr-1" /> Search</Button>
              <Button variant="outline" onClick={clearSearch} className="h-9">Reset</Button>
            </div>
          </div>
          {hasActiveSearch && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
              <span className="text-xs text-gray-500">Filtering:</span>
              {activeSearch.sender && <Badge variant="info" className="text-xs">From: {activeSearch.sender} <button onClick={() => { setSearchSender(''); setActiveSearch(s => ({...s, sender: ''})); }} className="ml-1"><X className="w-3 h-3 inline" /></button></Badge>}
              {activeSearch.recipient && <Badge variant="info" className="text-xs">To: {activeSearch.recipient} <button onClick={() => { setSearchRecipient(''); setActiveSearch(s => ({...s, recipient: ''})); }} className="ml-1"><X className="w-3 h-3 inline" /></button></Badge>}
              {activeSearch.domain && <Badge variant="info" className="text-xs">Domain: {activeSearch.domain} <button onClick={() => { setSearchDomain(''); setActiveSearch(s => ({...s, domain: ''})); }} className="ml-1"><X className="w-3 h-3 inline" /></button></Badge>}
              <span className="text-xs text-gray-400">({total} results)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick filters + Export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {['', 'incoming', 'outgoing'].map(d => (
              <button key={d} onClick={() => { setFilterDirection(d); setPage(1); }}
                className={`px-3 py-1.5 text-sm rounded-md ${filterDirection === d ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>
                {d === '' ? 'All' : d === 'incoming' ? 'In' : 'Out'}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {['', 'sent', 'bounced', 'rejected', 'deferred'].map(s => (
              <button key={s} onClick={() => { setFilterStatus(s); setPage(1); }}
                className={`px-3 py-1.5 text-sm rounded-md ${filterStatus === s ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>
                {s === '' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 bg-gray-50 border rounded-lg p-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          {[{l:'1D',d:1},{l:'7D',d:7},{l:'30D',d:30},{l:'90D',d:90}].map(o => (
            <button key={o.d} onClick={() => setExportDays(o.d)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md ${exportDays === o.d ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border'}`}>{o.l}</button>
          ))}
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}Export
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Mail className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">{hasActiveSearch ? 'No results' : 'No logs'}</p>
              <p className="text-sm mt-1">{hasActiveSearch ? 'Try different search' : 'Click Sync to import'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Relay</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.direction === 'incoming' ? <ArrowDownLeft className="w-4 h-4 text-blue-500" /> : <ArrowUpRight className="w-4 h-4 text-green-500" />}</TableCell>
                    <TableCell className="text-sm text-gray-500 whitespace-nowrap">{formatDate(item.timestamp)}</TableCell>
                    <TableCell className="font-mono text-sm max-w-[200px] truncate">
                      <button onClick={() => { setSearchSender(item.sender); setActiveSearch(s => ({...s, sender: item.sender})); setPage(1); }} className="hover:text-primary-600 hover:underline cursor-pointer text-left">
                        {item.sender || <span className="text-gray-300">-</span>}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-sm max-w-[200px] truncate">
                      <button onClick={() => { setSearchRecipient(item.recipient); setActiveSearch(s => ({...s, recipient: item.recipient})); setPage(1); }} className="hover:text-primary-600 hover:underline cursor-pointer text-left">
                        {item.recipient}
                      </button>
                    </TableCell>
                    <TableCell>
                      <button onClick={() => { setSearchDomain(item.domain); setActiveSearch(s => ({...s, domain: item.domain})); setPage(1); }}>
                        <Badge variant="outline" className="cursor-pointer hover:bg-gray-100">{item.domain}</Badge>
                      </button>
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell className="text-xs text-gray-500 max-w-[150px] truncate">{item.destination_relay}</TableCell>
                    <TableCell className="text-right text-sm text-gray-500">{item.size_bytes ? `${(item.size_bytes / 1024).toFixed(1)} KB` : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Showing {(page-1)*50+1}-{Math.min(page*50, total)} of {total}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}>Prev</Button>
            <span className="flex items-center px-3 text-sm">{page}/{pages}</span>
            <Button variant="outline" size="sm" disabled={page>=pages} onClick={() => setPage(p=>p+1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
