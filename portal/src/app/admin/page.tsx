'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Users, Globe, Mail, Server } from 'lucide-react';
import { formatNumber, formatDate } from '@/lib/utils';

interface SystemStat {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const systemStats: SystemStat[] = [
  { label: 'Total Tenants', value: 156, icon: Users, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  { label: 'Total Domains', value: 842, icon: Globe, color: 'text-green-600', bgColor: 'bg-green-50' },
  { label: 'Emails Processed', value: 12456789, icon: Mail, color: 'text-purple-600', bgColor: 'bg-purple-50' },
  { label: 'System Load', value: 42, icon: Server, color: 'text-orange-600', bgColor: 'bg-orange-50' },
];

const recentActivity = [
  { id: '1', tenant: 'Acme Corp', action: 'Added domain mail.acme.com', time: new Date(Date.now() - 300000).toISOString() },
  { id: '2', tenant: 'Startup Inc', action: 'Upgraded to Pro plan', time: new Date(Date.now() - 1800000).toISOString() },
  { id: '3', tenant: 'Global Ltd', action: 'Rotated API key', time: new Date(Date.now() - 3600000).toISOString() },
  { id: '4', tenant: 'Tech Co', action: 'Added 5 filter rules', time: new Date(Date.now() - 7200000).toISOString() },
  { id: '5', tenant: 'Dev Shop', action: 'Registered new account', time: new Date(Date.now() - 14400000).toISOString() },
];

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">System overview and tenant activity</p>
      </div>

      {/* System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {systemStats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {stat.label === 'System Load' ? `${stat.value}%` : formatNumber(stat.value)}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${stat.bgColor}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
              {stat.label === 'System Load' && (
                <div className="mt-3 w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${stat.value}%` }} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Tenant Activity */}
      <Card>
        <CardHeader><CardTitle>Recent Tenant Activity</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50">
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-primary-700">{activity.tenant.charAt(0)}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{activity.tenant}</span> {activity.action}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(activity.time, 'relative')}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
