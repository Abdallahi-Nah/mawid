'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface ChartPoint {
  label: string;
  value: number;
}

export function BookingsChart({
  data,
  rtl,
  ariaLabel,
  seriesLabel,
}: {
  data: ChartPoint[];
  rtl: boolean;
  ariaLabel: string;
  seriesLabel: string;
}) {
  const tick = { fill: 'hsl(var(--muted-foreground))', fontSize: 12 };
  return (
    <div>
      <div role="img" aria-label={ariaLabel} className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: rtl ? 0 : 8, left: rtl ? 8 : 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" reversed={rtl} tickLine={false} axisLine={false} tick={tick} />
            <YAxis
              orientation={rtl ? 'right' : 'left'}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={32}
              tick={tick}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))' }}
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 12,
                color: 'hsl(var(--foreground))',
              }}
              formatter={(value) => [value, seriesLabel]}
            />
            <Bar
              dataKey="value"
              fill="hsl(var(--chart-1))"
              radius={[8, 8, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Text alternative for screen readers */}
      <div className="relative h-0 overflow-hidden">
        <table className="sr-only">
          <caption>{ariaLabel}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <th scope="row">{d.label}</th>
                <td>{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
