'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cmpApi } from '@/lib/api';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { TrafficChart } from '@/components/dashboard/traffic-chart';
import { SpamRatioChart } from '@/components/dashboard/spam-ratio-chart';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { TopDomains } from '@/components/dashboard/top-domains';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const periods = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
];

export default function DashboardPage() {
  const [period, setPeriod] = useState('30d');

  const { data: traffic } = useQuery({
    queryKey: ['traffic', period],
    queryFn: () => cmpApi.reports.traffic({ period }),
  });

  const { data: spamData } = useQuery({
    queryKey: ['spam', period],
    queryFn: () => cmpApi.reports.spam({ period }),
  });

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
          <p className="text-sm text-gray-500 mt-1">Your mail gateway performance at a glance</p>
        </div>
        <div className="flex items-center bg-gray-100 rounded-lg p-1">
          {periods.map((p: any) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                period === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats cards */}
      <StatsCards />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrafficChart data={traffic?.byHour?.map((h: any) => ({ hour: String(h.hour).padStart(2, "0") + ":00", incoming: h.incoming || 0, outgoing: h.outgoing || h.count || 0, spam: h.spam || 0 }))} />
        </div>
        <div>
          <SpamRatioChart />
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity />
        <TopDomains />
      </div>
    </div>
  );
}
