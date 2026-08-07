'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { cmpApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle, Copy, ArrowLeft, Loader2, Key, FileText } from 'lucide-react';
import { formatNumber, formatDate } from '@/lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';

// Convert PEM public key to DNS DKIM record format
function pemToDkimRecord(pem: string): string {
  if (!pem) return '';
  // Remove PEM headers and newlines
  const base64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  return `v=DKIM1; h=sha256; k=rsa; p=${base64}`;
}

export default function DomainDetailPage() {
  const params = useParams();
  const domainId = params.id as string;
  const [showDkimRecord, setShowDkimRecord] = useState(false);

  const { data: domain, isLoading } = useQuery({
    queryKey: ['domain', domainId],
    queryFn: () => cmpApi.domains.get(domainId),
  });

  const { data: dnsCheck } = useQuery({
    queryKey: ['dns-check', domainId],
    queryFn: () => cmpApi.domains.dnsCheck(domainId),
    enabled: !!domain,
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

  const dkimRecord = domain.dkimPublicKey ? pemToDkimRecord(domain.dkimPublicKey) : '';
  const dkimHostName = domain.dkimSelector ? `${domain.dkimSelector}._domainkey.${domain.domainName}` : '';

  const dnsRecords = [
    { name: 'MX Record', value: domain.mxRecord || 'Not configured', ok: dnsCheck?.mxOk ?? !!domain.mxRecord, type: 'MX', host: domain.domainName },
    { name: 'SPF Record', value: domain.spfRecord || 'Not configured', ok: dnsCheck?.spfOk ?? !!domain.spfRecord, type: 'TXT', host: domain.domainName },
    { name: 'DKIM Record', value: dkimRecord || 'Not configured', ok: dnsCheck?.dkimOk ?? !!domain.dkimPublicKey, type: 'TXT', host: dkimHostName },
    { name: 'DMARC Record', value: domain.dmarcRecord || 'Not configured', ok: dnsCheck?.dmarcOk ?? !!domain.dmarcRecord, type: 'TXT', host: `_dmarc.${domain.domainName}` },
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
            <Link href={`/domains/${domainId}/setup`}>
              <Button variant="outline" size="sm" className="ml-2 border-blue-300 text-blue-700 hover:bg-blue-50">
                Setup Wizard
              </Button>
            </Link>
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
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            DNS Records - Add These to Your DNS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {dnsRecords.map((record) => (
              <div key={record.name} className="border rounded-lg overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
                  <div className="flex items-center gap-3">
                    {record.ok ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{record.name}</p>
                      <p className="text-xs text-gray-500">Type: {record.type}</p>
                    </div>
                  </div>
                  <Badge variant={record.ok ? 'success' : 'warning'}>
                    {record.ok ? 'Configured' : 'Not Configured'}
                  </Badge>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  {/* Host/Name */}
                  {record.host && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Host/Name:</p>
                      <div className="flex items-center gap-2 bg-white p-2 rounded border">
                        <code className="text-sm font-mono flex-1 text-gray-900">{record.host}</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(record.host!)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Value */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Value:</p>
                    <div className="flex items-start gap-2 bg-white p-2 rounded border">
                      <code className="text-xs font-mono flex-1 text-gray-900 break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {record.value}
                      </code>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(record.value)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {/* DKIM specific instructions */}
                  {record.name === 'DKIM Record' && dkimRecord && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Key className="w-4 h-4 text-blue-600" />
                        <p className="text-sm font-medium text-blue-900">How to add DKIM record:</p>
                      </div>
                      <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                        <li>Go to your DNS management panel (Plesk/cPanel/Cloudflare)</li>
                        <li>Add a new TXT record</li>
                        <li>Set Name/Host to: <code className="bg-blue-100 px-1 rounded">{dkimHostName}</code></li>
                        <li>Set Value to the DKIM record above</li>
                        <li>Save and wait 5-60 minutes for DNS propagation</li>
                      </ol>
                    </div>
                  )}

                  {/* SPF specific instructions */}
                  {record.name === 'SPF Record' && !record.ok && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-800">
                        <strong>Recommended SPF record:</strong><br/>
                        <code className="bg-blue-100 px-1 rounded">v=spf1 ip4:103.24.12.21 include:_spf.google.com ~all</code>
                      </p>
                    </div>
                  )}

                  {/* DMARC specific instructions */}
                  {record.name === 'DMARC Record' && !record.ok && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-800">
                        <strong>Recommended DMARC record:</strong><br/>
                        <code className="bg-blue-100 px-1 rounded">v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain.domainName}; fo=1</code>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
                {filters.map((filter: any) => (
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
