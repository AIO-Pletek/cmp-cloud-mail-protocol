'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Mail, ShieldAlert, Globe, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

interface Activity {
  id: string;
  type: 'email' | 'spam' | 'domain' | 'quarantine' | 'success';
  description: string;
  timestamp: string;
}

const defaultActivities: Activity[] = [
  { id: '1', type: 'spam', description: '42 spam emails blocked for example.com', timestamp: new Date(Date.now() - 300000).toISOString() },
  { id: '2', type: 'domain', description: 'Domain mail.newcorp.io verified successfully', timestamp: new Date(Date.now() - 1800000).toISOString() },
  { id: '3', type: 'quarantine', description: '15 emails moved to quarantine', timestamp: new Date(Date.now() - 3600000).toISOString() },
  { id: '4', type: 'success', description: 'DKIM keys rotated for acme.com', timestamp: new Date(Date.now() - 7200000).toISOString() },
  { id: '5', type: 'email', description: 'High volume alert: 10K+ emails/hr on startup.io', timestamp: new Date(Date.now() - 14400000).toISOString() },
];

const iconMap = {
  email: { icon: Mail, color: 'text-blue-500', bg: 'bg-blue-50' },
  spam: { icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-50' },
  domain: { icon: Globe, color: 'text-green-500', bg: 'bg-green-50' },
  quarantine: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50' },
  success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' },
};

export function RecentActivity({ data }: { data?: Activity[] }) {
  const activities = data || defaultActivities;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => {
            const config = iconMap[activity.type];
            const Icon = config.icon;
            return (
              <div key={activity.id} className="flex items-start gap-3">
                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', config.bg)}>
                  <Icon className={cn('w-4 h-4', config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{activity.description}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(activity.timestamp, 'relative')}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
