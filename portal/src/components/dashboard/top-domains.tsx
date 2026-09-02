'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/lib/utils';

interface TopDomain {
  domain: string;
  emails: number;
  spam: number;
  status: string;
  healthScore: number;
}

const defaultDomains: TopDomain[] = [
  { domain: 'example.com', emails: 45230, spam: 2340, status: 'Active', healthScore: 98 },
  { domain: 'startup.io', emails: 32100, spam: 1890, status: 'Active', healthScore: 95 },
  { domain: 'acme.com', emails: 28400, spam: 3200, status: 'Active', healthScore: 87 },
  { domain: 'newcorp.io', emails: 15600, spam: 890, status: 'Pending', healthScore: 72 },
  { domain: 'testing.dev', emails: 8900, spam: 2100, status: 'Active', healthScore: 65 },
];

export function TopDomains({ data }: { data?: TopDomain[] }) {
  const domains = data || defaultDomains;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Domains</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead className="text-right">Emails</TableHead>
              <TableHead className="text-right">Spam</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.map((d: any) => (
              <TableRow key={d.domain}>
                <TableCell className="font-medium">{d.domain}</TableCell>
                <TableCell className="text-right">{formatNumber(d.emails)}</TableCell>
                <TableCell className="text-right">{formatNumber(d.spam)}</TableCell>
                <TableCell>
                  <Badge variant={d.status === 'Active' ? 'success' : 'warning'}>{d.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${d.healthScore >= 90 ? 'bg-green-500' : d.healthScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${d.healthScore}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{d.healthScore}%</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
