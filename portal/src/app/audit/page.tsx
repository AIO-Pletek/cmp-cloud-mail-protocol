'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table';
import {
  Shield, RefreshCw, Loader2, Search, X, Calendar, Globe, User, Activity
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterResourceType, setFilterResourceType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeFilters, setActiveFilters] = useState({
    action: '', user: '', resourceType: '', dateFrom: '', dateTo: ''
  });

  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', page, activeFilters],
    queryFn: () => cmpApi.audit.list({
      page,
      per_page: 50,
      action: activeFilters.action || undefined,
      user_email: activeFilters.user || undefined,
      resource_type: activeFilters.resourceType || undefined,
      date_from: activeFilters.dateFrom || undefined,
      date_to: activeFilters.dateTo || undefined,
    }),
  });

  const handleSearch = () => {
    setActiveFilters({
      action: filterAction,
      user: filterUser,
      resourceType: filterResourceType,
      dateFrom,
      dateTo,
    });
    setPage(1);
  };

  const clearFilters = () => {
    setFilterAction('');
    setFilterUser('');
    setFilterResourceType('');
    setDateFrom('');
    setDateTo('');
    setActiveFilters({ action: '', user: '', resourceType: '', dateFrom: '', dateTo: '' });
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const hasActiveFilters = Object.values(activeFilters).some(v => v);

  const items = logsData?.items || [];
  const total = logsData?.total || 0;
  const totalPages = Math.ceil(total / 50) || 1;

  const getActionBadge = (action: string) => {
    const actionMap: Record<string, { variant: string; color: string }> = {
      create: { variant: 'success', color: 'text-green-700 bg-green-50 border-green-200' },
      update: { variant: 'info', color: 'text-blue-700 bg-blue-50 border-blue-200' },
      delete: { variant: 'danger', color: 'text-red-700 bg-red-50 border-red-200' },
      login: { variant: 'outline', color: 'text-gray-700 bg-gray-50 border-gray-200' },
      verify: { variant: 'warning', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
      update_branding: { variant: 'info', color: 'text-purple-700 bg-purple-50 border-purple-200' },
    };
    const cfg = actionMap[action] || { variant: 'outline', color: 'text-gray-600 bg-gray-50 border-gray-200' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.color}`}>
        {action}
      </span>
    );
  };

  const getResourceIcon = (resourceType: string) => {
    switch (resourceType) {
      case 'domain': return <Globe className="w-3.5 h-3.5 text-blue-500" />;
      case 'tenant': return <User className="w-3.5 h-3.5 text-purple-500" />;
      default: return <Activity className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Log</h2>
          <p className="text-sm text-gray-500 mt-1">Track all administrative actions and system events</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filters</span>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                <X className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Action</label>
              <Input
                placeholder="create, delete..."
                value={filterAction}
                onChange={e => setFilterAction(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">User Email</label>
              <Input
                placeholder="admin@example.com"
                value={filterUser}
                onChange={e => setFilterUser(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Resource Type</label>
              <Input
                placeholder="domain, tenant..."
                value={filterResourceType}
                onChange={e => setFilterResourceType(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={handleSearch} className="h-9">
              <Search className="w-4 h-4 mr-1" /> Search
            </Button>
            <Button variant="outline" onClick={clearFilters} className="h-9">Reset</Button>
          </div>
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
              <span className="text-xs text-gray-500">Active filters:</span>
              {activeFilters.action && (
                <Badge variant="info" className="text-xs">
                  Action: {activeFilters.action}
                  <button onClick={() => { setFilterAction(''); setActiveFilters(f => ({...f, action: ''})); }} className="ml-1"><X className="w-3 h-3 inline" /></button>
                </Badge>
              )}
              {activeFilters.user && (
                <Badge variant="info" className="text-xs">
                  User: {activeFilters.user}
                  <button onClick={() => { setFilterUser(''); setActiveFilters(f => ({...f, user: ''})); }} className="ml-1"><X className="w-3 h-3 inline" /></button>
                </Badge>
              )}
              {activeFilters.resourceType && (
                <Badge variant="info" className="text-xs">
                  Resource: {activeFilters.resourceType}
                  <button onClick={() => { setFilterResourceType(''); setActiveFilters(f => ({...f, resourceType: ''})); }} className="ml-1"><X className="w-3 h-3 inline" /></button>
                </Badge>
              )}
              {activeFilters.dateFrom && <Badge variant="info" className="text-xs">From: {activeFilters.dateFrom}</Badge>}
              {activeFilters.dateTo && <Badge variant="info" className="text-xs">To: {activeFilters.dateTo}</Badge>}
              <span className="text-xs text-gray-400">({total} results)</span>
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
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Shield className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">{hasActiveFilters ? 'No results' : 'No audit logs'}</p>
              <p className="text-sm mt-1">{hasActiveFilters ? 'Try adjusting your filters' : 'Audit events will appear here'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Resource ID</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </TableCell>
                    <TableCell>{getActionBadge(item.action)}</TableCell>
                    <TableCell className="font-mono text-sm max-w-[200px] truncate">
                      <button
                        onClick={() => { setFilterUser(item.userEmail); setActiveFilters(f => ({...f, user: item.userEmail})); setPage(1); }}
                        className="hover:text-primary-600 hover:underline cursor-pointer text-left"
                      >
                        {item.userEmail}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {getResourceIcon(item.resourceType)}
                        <span className="text-sm">{item.resourceType}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-500 max-w-[120px] truncate">
                      {item.resourceId || <span className="text-gray-300">-</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-500">
                      {item.ipAddress || <span className="text-gray-300">-</span>}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 max-w-[200px] truncate">
                      {item.detailsJson ? (
                        <span title={item.detailsJson} className="cursor-help">
                          {item.detailsJson.length > 60 ? item.detailsJson.slice(0, 60) + '...' : item.detailsJson}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * 50 + 1}-{Math.min(page * 50, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <span className="flex items-center px-3 text-sm">{page}/{totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
