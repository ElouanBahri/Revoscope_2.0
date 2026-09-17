import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { gridline, seriesColor, textMuted } from "../palette";

interface Props {
  dates: string[];
  seriesA: (number | null)[];
  seriesB: (number | null)[];
  labelA: string;
  labelB: string;
  valueFormatter: (v: number) => string;
  yTickFormatter?: (v: number) => string;
}

export function ComparisonLineChart({ dates, seriesA, seriesB, labelA, labelB, valueFormatter, yTickFormatter }: Props) {
  const data = dates.map((date, i) => ({ date, a: seriesA[i], b: seriesB[i] }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={gridline} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: textMuted }}
          tickLine={false}
          axisLine={{ stroke: gridline }}
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 11, fill: textMuted }}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={yTickFormatter}
        />
        <Tooltip
          formatter={(value: number) => valueFormatter(value)}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="a" name={labelA} stroke={seriesColor(1)} strokeWidth={2} dot={false} />
        <Line
          type="monotone"
          dataKey="b"
          name={labelB}
          stroke={textMuted}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
