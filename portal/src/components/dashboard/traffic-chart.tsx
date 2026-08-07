'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface TrafficDataPoint {
  hour: string;
  incoming: number;
  outgoing: number;
  spam: number;
  [key: string]: any;
}

const defaultData: TrafficDataPoint[] = [
  { hour: '00:00', incoming: 1200, outgoing: 800, spam: 340 },
  { hour: '02:00', incoming: 800, outgoing: 500, spam: 210 },
  { hour: '04:00', incoming: 600, outgoing: 400, spam: 150 },
  { hour: '06:00', incoming: 1800, outgoing: 1200, spam: 420 },
  { hour: '08:00', incoming: 4500, outgoing: 3200, spam: 890 },
  { hour: '10:00', incoming: 5200, outgoing: 3800, spam: 1100 },
  { hour: '12:00', incoming: 4800, outgoing: 3500, spam: 950 },
  { hour: '14:00', incoming: 5100, outgoing: 3600, spam: 1050 },
  { hour: '16:00', incoming: 4200, outgoing: 3000, spam: 780 },
  { hour: '18:00', incoming: 2800, outgoing: 2000, spam: 520 },
  { hour: '20:00', incoming: 1900, outgoing: 1300, spam: 380 },
  { hour: '22:00', incoming: 1500, outgoing: 1000, spam: 300 },
];

export function TrafficChart({ data }: { data?: TrafficDataPoint[] }) {
  const chartData = data || defaultData;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Traffic</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="hour" tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              }}
            />
            <Legend />
            <Line type="monotone" dataKey="incoming" stroke="#2563eb" strokeWidth={2} dot={false} name="Incoming" />
            <Line type="monotone" dataKey="outgoing" stroke="#16a34a" strokeWidth={2} dot={false} name="Outgoing" />
            <Line type="monotone" dataKey="spam" stroke="#dc2626" strokeWidth={2} dot={false} name="Spam" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
