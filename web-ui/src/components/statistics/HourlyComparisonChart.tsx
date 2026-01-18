'use client';

/**
 * HourlyComparisonChart Component
 *
 * Displays forecast vs actual wind data as a bar + dot chart using Recharts.
 * Handles missing actual data gracefully with visual indicators.
 */

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface HourlyData {
  hour: number;
  displayTime: string;
  forecast: { wspd: number; gst: number } | null;
  actual: { wspd: number; gst: number } | null;
  error: { wspd: number; gst: number } | null;
}

interface HourlyComparisonChartProps {
  data: HourlyData[];
  metric: 'wspd' | 'gst';
  title: string;
}

interface ChartDataPoint {
  time: string;
  forecast: number | null;
  actual: number | null;
  error: number | null;
}

export default function HourlyComparisonChart({
  data,
  metric,
  title,
}: HourlyComparisonChartProps) {
  // Transform data for Recharts
  const chartData: ChartDataPoint[] = data.map((point) => ({
    time: point.displayTime,
    forecast: point.forecast ? point.forecast[metric] : null,
    actual: point.actual ? point.actual[metric] : null,
    error: point.error ? point.error[metric] : null,
  }));

  // Calculate Y-axis domain
  const allValues = chartData.flatMap((d) => [d.forecast, d.actual].filter(Boolean)) as number[];
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 20;
  const yMax = Math.ceil(maxValue / 5) * 5 + 5; // Round up to nearest 5 + buffer

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number | null; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload) return null;

    const forecastVal = payload.find(p => p.name === 'Forecast')?.value;
    const actualVal = payload.find(p => p.name === 'Actual')?.value;
    const error = actualVal !== null && actualVal !== undefined && forecastVal !== null && forecastVal !== undefined
      ? (actualVal - forecastVal).toFixed(1)
      : null;

    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg text-sm">
        <p className="font-semibold text-gray-800 mb-1">{label}</p>
        <div className="space-y-1">
          {forecastVal !== null && forecastVal !== undefined && (
            <p className="text-blue-600">
              Forecast: <span className="font-medium">{forecastVal.toFixed(1)} kt</span>
            </p>
          )}
          {actualVal !== null && actualVal !== undefined ? (
            <p className="text-orange-600">
              Actual: <span className="font-medium">{actualVal.toFixed(1)} kt</span>
            </p>
          ) : (
            <p className="text-gray-400 italic">Actual: No data</p>
          )}
          {error !== null && (
            <p className={`${Number(error) >= 0 ? 'text-green-600' : 'text-red-600'} border-t pt-1 mt-1`}>
              Error: <span className="font-medium">{Number(error) >= 0 ? '+' : ''}{error} kt</span>
              <span className="text-xs text-gray-500 ml-1">
                ({Number(error) >= 0 ? 'under' : 'over'})
              </span>
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      <h4 className="text-sm font-medium text-gray-700 mb-2 text-center">
        {title}
      </h4>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={{ stroke: '#d1d5db' }}
            axisLine={{ stroke: '#d1d5db' }}
          />
          <YAxis
            domain={[0, yMax]}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickLine={{ stroke: '#d1d5db' }}
            axisLine={{ stroke: '#d1d5db' }}
            label={{
              value: 'kt',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 11, fill: '#6b7280' },
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            iconSize={10}
          />
          <ReferenceLine y={0} stroke="#d1d5db" />

          {/* Forecast as bars */}
          <Bar
            dataKey="forecast"
            name="Forecast"
            fill="#3b82f6"
            fillOpacity={0.7}
            radius={[2, 2, 0, 0]}
          />

          {/* Actual as line with dots */}
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="#f97316"
            strokeWidth={2}
            dot={{
              fill: '#f97316',
              stroke: '#fff',
              strokeWidth: 2,
              r: 5,
            }}
            activeDot={{
              fill: '#f97316',
              stroke: '#fff',
              strokeWidth: 2,
              r: 7,
            }}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
