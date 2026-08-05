'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { cmpApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrafficChart } from '@/components/dashboard/traffic-chart';
import { CheckCircle, XCircle, Copy, ArrowLeft, Loader2 } from 'lucide-react';
import { formatNumber, formatDate } from '@/lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface DnsRecord {
  name: string;
  value: string;
  ok: boolean;
  type: string;
}

export default function DomainDetailPage() {
  const params = useParams();
  const domainId = params.id as string;

  const { data: domain, isLoading } = useQuery({
    queryKey: ['domain', domainId],
    queryFn: () => cmpApi.domains.dnsCheck(domainId),
  });

  const { data: filters } = useQuery({
    queryKey: ['filters', domainId],
    queryFn: () => cmpApi.filters.list(domainId),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Domain not found</p>
        <Link href="/domains">
          <Button variant="outline" className="mt-4">Back to Domains</Button>
        </Link>
      </div>
    );
  }

  const dnsRecords: DnsRecord[] = [
    { name: 'MX Record', value: domain.mxRecord || 'Not configured', ok: !!domain.mxRecord, type: 'MX' },
    { name: 'SPF Record', value: domain.spfRecord || 'Not configured', ok: !!domain.spfRecord, type: 'TXT' },
    { name: 'DKIM Selector', value: domain.dkimPublicKey ? `${domain.dkimSelector}._domainkey.${domain.domainName}` : 'Not configured', ok: !!domain.dkimPublicKey, type: 'TXT' },
    { name: 'DMARC Record', value: domain.dmarcRecord || 'Not configured', ok: !!domain.dmarcRecord, type: 'TXT' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/domains" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">{domain.domainName}</h2>
            <Badge variant={domain.isVerified ? 'success' : 'warning'}>
              {domain.isVerified ? 'Verified' : 'Pending Verification'}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {formatNumber(domain.emailCount)} emails processed · {formatNumber(domain.spamBlocked)} spam blocked
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Total Emails</p>
            <p className="text-2xl font-bold text-gray-900">{formatNumber(domain.emailCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Spam Blocked</p>
            <p className="text-2xl font-bold text-red-600">{formatNumber(domain.spamBlocked)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Created</p>
            <p className="text-lg font-semibold text-gray-900">{formatDate(domain.createdAt)}</p>
          </CardContent>
        </Card>
      </div>

      {/* DNS Records */}
      <Card>
        <CardHeader>
          <CardTitle>DNS Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {dnsRecords.map((record) => (
              <div key={record.name} className="flex items-start justify-between p-4 rounded-lg border border-gray-100 bg-gray-50">
                <div className="flex items-start gap-3">
                  {record.ok ? (
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{record.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5 font-mono break-all">{record.value}</p>
                    <p className="text-xs text-gray-400 mt-1">Type: {record.type}</p>
                  </div>
                </div>
                {record.value !== 'Not configured' && (
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(record.value)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Traffic Chart */}
      <TrafficChart />

      {/* Filter Rules */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Filter Rules</CardTitle>
            <Link href="/filters">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {filters && filters.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filters.map((filter) => (
                  <TableRow key={filter.id}>
                    <TableCell className="font-mono text-sm">{filter.pattern}</TableCell>
                    <TableCell><Badge variant="info">{filter.ruleType}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={filter.action === 'block' ? 'danger' : filter.action === 'allow' ? 'success' : 'warning'}>
                        {filter.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={filter.isActive ? 'success' : 'outline'}>
                        {filter.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">No filter rules configured for this domain.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
