'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Mail, ShieldAlert, Globe, MailWarning } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface StatCard {
  title: string;
  value: number;
  change: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const stats: StatCard[] = [
  { title: 'Total Emails', value: 145832, change: 12.5, icon: Mail, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  { title: 'Spam Blocked', value: 23451, change: -3.2, icon: ShieldAlert, color: 'text-red-600', bgColor: 'bg-red-50' },
  { title: 'Active Domains', value: 24, change: 4.2, icon: Globe, color: 'text-green-600', bgColor: 'bg-green-50' },
  { title: 'Quarantined', value: 1842, change: 8.7, icon: MailWarning, color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
];

export function StatsCards({ data }: { data?: Partial<Record<string, number>> }) {
  const displayStats = stats.map((s) => ({
    ...s,
    value: data?.[s.title.toLowerCase().replace(/\s/g, '_')] ?? s.value,
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {displayStats.map((stat) => (
        <Card key={stat.title}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(stat.value)}</p>
                <div className="flex items-center mt-1">
                  <span className={cn('text-xs font-medium', stat.change >= 0 ? 'text-green-600' : 'text-red-600')}>
                    {stat.change >= 0 ? '+' : ''}{stat.change}%
                  </span>
                  <span className="text-xs text-gray-400 ml-1">vs last period</span>
                </div>
              </div>
              <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center', stat.bgColor)}>
                <stat.icon className={cn('w-6 h-6', stat.color)} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
