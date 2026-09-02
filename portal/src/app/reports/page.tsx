'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { TrafficChart } from '@/components/dashboard/traffic-chart';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle, Download, Loader2 } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Traffic', value: 'traffic' },
  { label: 'Spam', value: 'spam' },
  { label: 'Domain Health', value: 'health' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('traffic');
  const [period, setPeriod] = useState('30d');

  const { data: traffic, isLoading: trafficLoading } = useQuery({
    queryKey: ['report-traffic', period],
    queryFn: () => cmpApi.reports.traffic({ period }),
    enabled: activeTab === 'traffic',
  });

  const { data: spamData, isLoading: spamLoading } = useQuery({
    queryKey: ['report-spam', period],
    queryFn: () => cmpApi.reports.spam({ period }),
    enabled: activeTab === 'spam',
  });

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['domain-health'],
    queryFn: () => cmpApi.reports.domainHealth(),
    enabled: activeTab === 'health',
  });

  const handleExport = async () => {
    try {
      const blob = await cmpApi.reports.export({ period, format: 'csv' });
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cmp-report-${period}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
          <p className="text-sm text-gray-500 mt-1">Analyze mail traffic, spam trends, and domain health</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            {['7d', '30d', '90d'].map((p: any) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn('px-3 py-1.5 text-sm font-medium rounded-md transition-colors', period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
              >
                {p}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((tab: any) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'pb-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.value ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Traffic Tab */}
      {activeTab === 'traffic' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Incoming', value: traffic?.totalIncoming ?? 0, color: 'text-blue-600' },
              { label: 'Total Outgoing', value: traffic?.totalOutgoing ?? 0, color: 'text-green-600' },
              { label: 'Total Spam', value: traffic?.totalSpam ?? 0, color: 'text-red-600' },
              { label: 'Total Virus', value: traffic?.totalVirus ?? 0, color: 'text-yellow-600' },
            ].map((s: any) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <p className="text-sm text-gray-500">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{formatNumber(s.value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <TrafficChart data={traffic?.byHour?.map((h: any) => ({ hour: h.hour, incoming: h.incoming, outgoing: h.outgoing, spam: h.spam }))} />
          {traffic?.byDomain && traffic.byDomain.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Traffic by Domain</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead className="text-right">Incoming</TableHead>
                      <TableHead className="text-right">Outgoing</TableHead>
                      <TableHead className="text-right">Spam</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {traffic.byDomain.map((d: any) => (
                      <TableRow key={d.domain}>
                        <TableCell className="font-medium">{d.domain}</TableCell>
                        <TableCell className="text-right">{formatNumber(d.incoming)}</TableCell>
                        <TableCell className="text-right">{formatNumber(d.outgoing)}</TableCell>
                        <TableCell className="text-right text-red-600">{formatNumber(d.spam)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Spam Tab */}
      {activeTab === 'spam' && (
        <div className="space-y-6">
          {spamData?.topSenders && spamData.topSenders.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Top Spam Senders</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sender</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spamData.topSenders.map((s: any) => (
                      <TableRow key={s.sender}>
                        <TableCell className="font-mono text-sm">{s.sender}</TableCell>
                        <TableCell className="text-right">{formatNumber(s.count)}</TableCell>
                        <TableCell className="text-right">{s.percentage.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {spamData?.byDomain && spamData.byDomain.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Spam by Domain</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead className="text-right">Spam</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Spam Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spamData.byDomain.map((d: any) => (
                      <TableRow key={d.domain}>
                        <TableCell className="font-medium">{d.domain}</TableCell>
                        <TableCell className="text-right text-red-600">{formatNumber(d.spam)}</TableCell>
                        <TableCell className="text-right">{formatNumber(d.total)}</TableCell>
                        <TableCell className="text-right">{((d.spam / d.total) * 100).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {(!spamData?.topSenders?.length && !spamData?.byDomain?.length) && (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">No spam data available for this period.</CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Domain Health Tab */}
      {activeTab === 'health' && (
        <Card>
          <CardHeader><CardTitle>Domain Health</CardTitle></CardHeader>
          <CardContent>
            {healthLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : health && health.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead className="text-center">MX</TableHead>
                    <TableHead className="text-center">SPF</TableHead>
                    <TableHead className="text-center">DKIM</TableHead>
                    <TableHead className="text-center">DMARC</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {health.map((h: any) => (
                    <TableRow key={h.domain}>
                      <TableCell className="font-medium">{h.domain}</TableCell>
                      {['mxOk', 'spfOk', 'dkimOk', 'dmarcOk'].map((key: any) => (
                        <TableCell key={key} className="text-center">
                          {h[key as keyof typeof h] ? (
                            <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                          )}
                        </TableCell>
                      ))}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full', h.score >= 90 ? 'bg-green-500' : h.score >= 70 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${h.score}%` }} />
                          </div>
                          <span className="text-sm font-medium">{h.score}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-gray-500 py-12">No domain health data available.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
