'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { cmpApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle, Copy, ArrowLeft, Loader2, Key, FileText, Mail } from 'lucide-react';
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
  const queryClient = useQueryClient();

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

  const { data: approvalData, isLoading: approvalLoading } = useQuery({
    queryKey: ['domain-approval', domainId],
    queryFn: () => cmpApi.domains.getApproval(domainId),
    enabled: !!domainId,
  });

  const approvalMutation = useMutation({
    mutationFn: (enabled: boolean) => cmpApi.domains.setApproval(domainId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domain-approval', domainId] });
      toast.success('Mail policy updated');
    },
    onError: () => {
      toast.error('Failed to update mail policy');
    },
  });

  const { data: apData, isLoading: apLoading } = useQuery({
    queryKey: ['domain-attachment-password', domainId],
    queryFn: () => cmpApi.domains.getAttachmentPassword(domainId),
    enabled: !!domainId,
  });

  const apMutation = useMutation({
    mutationFn: (enabled: boolean) => cmpApi.domains.setAttachmentPassword(domainId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domain-attachment-password', domainId] });
      toast.success('Attachment policy updated');
    },
    onError: () => {
      toast.error('Failed to update attachment policy');
    },
  });

  const { data: stData, isLoading: stLoading } = useQuery({
    queryKey: ['domain-spam-threshold', domainId],
    queryFn: () => cmpApi.domains.getSpamThreshold(domainId),
    enabled: !!domainId,
  });

  const stMutation = useMutation({
    mutationFn: (value: number | null) => cmpApi.domains.setSpamThreshold(domainId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domain-spam-threshold', domainId] });
      toast.success('Spam threshold updated');
    },
    onError: () => {
      toast.error('Failed to update spam threshold');
    },
  });

  // Spam threshold input state — hooks must stay above the early returns below
  const [stInput, setStInput] = useState('');
  const stValueForEffect: number | null = stData?.spamThreshold ?? null;
  useEffect(() => { setStInput(stValueForEffect === null ? '' : String(stValueForEffect)); }, [stValueForEffect]);

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

  const approvalEnabled: boolean = approvalData?.approvalRequired ?? false;
  const apRequired: boolean = apData?.attachmentPasswordRequired ?? true;
  const stValue: number | null = stData?.spamThreshold ?? null;

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

      {/* Mail Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Mail Policy
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Control whether incoming emails to this domain require admin approval before delivery
          </p>
        </CardHeader>
        <CardContent>
          {approvalLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              <span className="text-sm text-gray-500">Loading policy...</span>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900">Domain Approval Required</p>
                <p className="text-xs text-gray-500">
                  When enabled, emails to this domain are held for review. When disabled, emails are delivered directly.
                </p>
                <div className="mt-2">
                  {approvalEnabled ? (
                    <Badge variant="success">Approval Required</Badge>
                  ) : (
                    <Badge variant="outline">Direct Delivery</Badge>
                  )}
                </div>
              </div>
              <Switch
                checked={approvalEnabled}
                disabled={approvalMutation.isPending}
                onCheckedChange={(checked: boolean) => approvalMutation.mutate(checked)}
                className={approvalEnabled ? 'data-[state=checked]:bg-green-500' : ''}
                aria-label="Toggle domain approval requirement"
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-4 mt-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900">Attachment Password Required</p>
              <p className="text-xs text-gray-500">
                When enabled, emails with attachments that are not password-protected are rejected. When disabled, attachments pass without a password.
              </p>
              <div className="mt-2">
                {apRequired ? (
                  <Badge variant="success">Password Required</Badge>
                ) : (
                  <Badge variant="outline">Password Not Required</Badge>
                )}
              </div>
            </div>
            <Switch
              checked={apRequired}
              disabled={apLoading || apMutation.isPending}
              onCheckedChange={(checked: boolean) => apMutation.mutate(checked)}
              className={apRequired ? 'data-[state=checked]:bg-green-500' : ''}
              aria-label="Toggle attachment password requirement"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4 mt-4">
            <div className="space-y-1 flex-1">
              <p className="text-sm font-medium text-gray-900">Spam Score Threshold</p>
              <p className="text-xs text-gray-500">
                Reject emails with spam score at or above this value for this domain. Lower = stricter. Leave empty to use the global default (15).
              </p>
              <div className="mt-2">
                {stValue === null ? (
                  <Badge variant="outline">Global default (15)</Badge>
                ) : (
                  <Badge variant="success">Custom: {stValue}</Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <Input
                type="number"
                min={1}
                max={50}
                step={0.5}
                placeholder="15"
                value={stInput}
                onChange={(e: any) => setStInput(e.target.value)}
                className="w-24"
              />
              <Button
                size="sm"
                disabled={stLoading || stMutation.isPending}
                onClick={() => {
                  const v = parseFloat(stInput);
                  stMutation.mutate(stInput.trim() === '' || isNaN(v) ? null : v);
                }}
              >
                {stMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
              {stValue !== null && (
                <Button size="sm" variant="outline" onClick={() => stMutation.mutate(null)} disabled={stMutation.isPending}>
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
            {dnsRecords.map((record: any) => (
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
