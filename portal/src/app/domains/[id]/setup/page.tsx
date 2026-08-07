'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { cmpApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CheckCircle,
  Circle,
  Copy,
  ArrowLeft,
  Loader2,
  Server,
  Shield,
  Key,
  FileText,
  Mail,
  ChevronRight,
  RefreshCw,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import type { SetupCheckResult } from '@/types';

// PEM public key → DNS DKIM record
function pemToDkimRecord(pem: string): string {
  if (!pem) return '';
  const base64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  return `v=DKIM1; h=sha256; k=rsa; p=${base64}`;
}

interface StepDef {
  num: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  doneKey: keyof SetupCheckResult;
  recordKey: keyof SetupCheckResult;
  instructions: string[];
}

export default function DomainSetupPage() {
  const params = useParams();
  const router = useRouter();
  const domainId = params.id as string;
  const qc = useQueryClient();
  const [testEmail, setTestEmail] = useState('');
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const { data: domain, isLoading: domainLoading } = useQuery({
    queryKey: ['domain', domainId],
    queryFn: () => cmpApi.domains.get(domainId),
  });

  const { data: setup, isLoading: setupLoading, refetch, isFetching } = useQuery<SetupCheckResult>({
    queryKey: ['setup-check', domainId],
    queryFn: () => cmpApi.domains.setupCheck(domainId),
    enabled: !!domain,
    refetchInterval: 30000,
  });

  const verifyMutation = useMutation({
    mutationFn: () => cmpApi.domains.setupCheck(domainId),
    onSuccess: (data) => {
      qc.setQueryData(['setup-check', domainId], data);
      toast.success('DNS records re-checked');
    },
    onError: () => toast.error('Verification failed'),
  });

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('cmp_access_token') || '';
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'}/domains/${domainId}/test-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: testEmail }),
        }
      );
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Test email sent! Check your inbox.');
      qc.invalidateQueries({ queryKey: ['setup-check', domainId] });
    },
    onError: () => toast.error('Failed to send test email'),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const steps: StepDef[] = [
    {
      num: 1,
      title: 'Add MX Record',
      subtitle: 'Mail Exchanger record',
      icon: <Server className="w-5 h-5" />,
      doneKey: 'step1Dns',
      recordKey: 'step1Record',
      instructions: [
        'Go to your DNS management panel (Plesk, cPanel, Cloudflare, etc.)',
        'Add a new MX record',
        'Set Host/Name to: @ (or your domain)',
        `Set Value/Points to: mail.${domain?.domainName || ''}`,
        'Set Priority to: 10',
        'Save and wait for DNS propagation (5-60 minutes)',
      ],
    },
    {
      num: 2,
      title: 'Add SPF Record',
      subtitle: 'Sender Policy Framework',
      icon: <Shield className="w-5 h-5" />,
      doneKey: 'step2Spf',
      recordKey: 'step2Record',
      instructions: [
        'Add a new TXT record in your DNS',
        'Set Host/Name to: @ (or your domain)',
        'Set Value to the SPF record shown below',
        'If you already have an SPF record, append: ip4:103.24.12.21',
        'Save and wait for DNS propagation',
      ],
    },
    {
      num: 3,
      title: 'Add DKIM Record',
      subtitle: 'DomainKeys Identified Mail',
      icon: <Key className="w-5 h-5" />,
      doneKey: 'step3Dkim',
      recordKey: 'step3Record',
      instructions: [
        'Add a new TXT record in your DNS',
        'Set Host/Name to the DKIM selector hostname shown below',
        'Set Value to the full DKIM record shown below',
        'The record is long — make sure you copy it completely',
        'Save and wait for DNS propagation',
      ],
    },
    {
      num: 4,
      title: 'Add DMARC Record',
      subtitle: 'Domain-based Message Authentication',
      icon: <FileText className="w-5 h-5" />,
      doneKey: 'step4Dmarc',
      recordKey: 'step4Record',
      instructions: [
        'Add a new TXT record in your DNS',
        'Set Host/Name to: _dmarc',
        'Set Value to the DMARC record shown below',
        'Start with quarantine policy; move to reject after monitoring',
        'Save and wait for DNS propagation',
      ],
    },
    {
      num: 5,
      title: 'Send Test Email',
      subtitle: 'Verify email delivery works',
      icon: <Mail className="w-5 h-5" />,
      doneKey: 'step5Test',
      recordKey: 'step5Test', // not a real record key
      instructions: [
        'Enter an email address you can check below',
        'Click "Send Test Email"',
        'Check your inbox (and spam folder) for the test message',
        'If received, your domain setup is complete!',
      ],
    },
  ];

  const isLoading = domainLoading || setupLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!domain || !setup) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Domain not found</p>
        <Link href="/domains">
          <Button variant="outline" className="mt-4">Back to Domains</Button>
        </Link>
      </div>
    );
  }

  const completedSteps = [setup.step1Dns, setup.step2Spf, setup.step3Dkim, setup.step4Dmarc, setup.step5Test].filter(Boolean).length;
  const allDone = completedSteps === 5;

  const getStepRecord = (step: StepDef) => {
    if (step.num === 5) return null;
    const rec = setup[step.recordKey] as { type: string; host: string; value: string } | undefined;
    return rec;
  };

  const getDisplayValue = (step: StepDef, record: { type: string; host: string; value: string }) => {
    if (step.num === 3 && domain.dkimPublicKey && !record.value) {
      return pemToDkimRecord(domain.dkimPublicKey);
    }
    return record.value;
  };

  const getStepStatus = (step: StepDef): 'done' | 'current' | 'pending' => {
    const done = (setup as any)[step.doneKey] as boolean;
    if (done) return 'done';
    // Current step = first incomplete step
    const firstIncomplete = steps.find((s) => !(setup[s.doneKey] as boolean));
    if (firstIncomplete?.num === step.num) return 'current';
    return 'pending';
  };

  const StepStatusIcon = ({ status }: { status: 'done' | 'current' | 'pending' }) => {
    if (status === 'done') {
      return <CheckCircle className="w-6 h-6 text-green-500 shrink-0" />;
    }
    if (status === 'current') {
      return (
        <div className="w-6 h-6 rounded-full border-2 border-blue-500 bg-blue-100 shrink-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        </div>
      );
    }
    return <Circle className="w-6 h-6 text-gray-300 shrink-0" />;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/domains/${domainId}`} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">Domain Setup Wizard</h2>
          <p className="text-sm text-gray-500 mt-1">{domain.domainName}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => verifyMutation.mutate()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Re-check All
        </Button>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Setup Progress</span>
            <span className="text-sm font-bold text-gray-900">{setup.completionPercentage}%</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${setup.completionPercentage}%`,
                background: allDone
                  ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                  : 'linear-gradient(90deg, #3b82f6, #6366f1)',
              }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {completedSteps} of 5 steps completed
            {allDone && ' — Your domain is fully configured! 🎉'}
          </p>
        </CardContent>
      </Card>

      {/* Success banner */}
      {allDone && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">All steps completed!</p>
            <p className="text-xs text-green-700 mt-0.5">
              Your domain is fully configured and ready to send/receive emails through CMP.
            </p>
          </div>
          <Link href={`/domains/${domainId}`}>
            <Button size="sm" className="bg-green-600 hover:bg-green-700">
              View Domain
            </Button>
          </Link>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step: any) => {
          const status = getStepStatus(step);
          const done = (setup as any)[step.doneKey] as boolean;
          const record = getStepRecord(step);
          const isExpanded = expandedStep === step.num || status === 'current' || (!done && expandedStep === null && step.num === 1);

          return (
            <Card
              key={step.num}
              className={`transition-all ${
                status === 'done'
                  ? 'border-green-200 bg-green-50/30'
                  : status === 'current'
                  ? 'border-blue-200 shadow-md'
                  : 'border-gray-200'
              }`}
            >
              {/* Step Header — always visible, clickable */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer select-none"
                onClick={() => setExpandedStep(isExpanded && status !== 'current' ? null : step.num)}
              >
                <StepStatusIcon status={status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-400">Step {step.num}</span>
                    {done && <Badge variant="success" className="text-[10px] px-1.5 py-0">Done</Badge>}
                    {status === 'current' && <Badge variant="info" className="text-[10px] px-1.5 py-0">Current</Badge>}
                  </div>
                  <p className="font-semibold text-gray-900 mt-0.5">{step.title}</p>
                  <p className="text-xs text-gray-500">{step.subtitle}</p>
                </div>
                <div className="text-gray-400">
                  {step.icon}
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                />
              </div>

              {/* Step Content — expandable */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">
                  {/* Instructions */}
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-800 mb-2">Instructions:</p>
                    <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
                      {step.instructions.map((inst: any, i: any) => (
                        <li key={i}>{inst}</li>
                      ))}
                    </ol>
                  </div>

                  {/* DNS Record to add (steps 1-4) */}
                  {record && step.num <= 4 && (
                    <div className="space-y-3">
                      {/* Record Type */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 w-16">Type:</span>
                        <Badge variant="info">{record.type}</Badge>
                      </div>

                      {/* Host */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Host / Name:</p>
                        <div className="flex items-center gap-2 bg-gray-50 rounded-lg border p-2.5">
                          <code className="text-sm font-mono flex-1 text-gray-900 break-all">{record.host}</code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 shrink-0"
                            onClick={() => copyToClipboard(record.host)}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Value */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Value:</p>
                        <div className="flex items-start gap-2 bg-gray-50 rounded-lg border p-2.5">
                          <code className="text-xs font-mono flex-1 text-gray-900 break-all whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {getDisplayValue(step, record) || 'Not yet generated'}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 shrink-0"
                            onClick={() => copyToClipboard(getDisplayValue(step, record) || '')}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Test email input (step 5) */}
                  {step.num === 5 && !done && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          value={testEmail}
                          onChange={(e) => setTestEmail(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          onClick={() => sendTestMutation.mutate()}
                          disabled={!testEmail || sendTestMutation.isPending}
                        >
                          {sendTestMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4 mr-2" />
                          )}
                          Send Test
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500">
                        This will send a test email through the CMP gateway to verify delivery works end-to-end.
                      </p>
                    </div>
                  )}

                  {/* Verify button for DNS steps */}
                  {step.num <= 4 && !done && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => verifyMutation.mutate()}
                      disabled={verifyMutation.isPending}
                      className="w-full"
                    >
                      {verifyMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Verify DNS Record
                    </Button>
                  )}

                  {/* Completed message */}
                  {done && (
                    <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3 text-sm">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span className="font-medium">
                        {step.num <= 4 ? 'DNS record verified successfully!' : 'Test email sent successfully!'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Back link */}
      <div className="flex justify-start pt-2 pb-8">
        <Link href={`/domains/${domainId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Domain Details
          </Button>
        </Link>
      </div>
    </div>
  );
}
