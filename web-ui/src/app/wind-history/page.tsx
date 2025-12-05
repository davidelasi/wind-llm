'use client';

import { useState } from 'react';
import Navigation from '../../components/Navigation';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { RefreshCw, Wind, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useWindData } from '@/hooks/useWindData';
import type { DayData } from '@/types/wind-data';

// Chart-specific data format
interface ProcessedDataPoint {
  time: string;
  windSpeed: number | null;
  gustSpeed: number | null;
  windDirection: number | null;
  windDirectionText: string;
  isEmpty: boolean;
}

interface ChartDayData {
  date: string;
  displayDate: string;
  data: ProcessedDataPoint[];
}

export default function WindHistoryPage() {
  // Use unified wind data hook
  const { data, metadata, isLoading, error, refresh } = useWindData({
    autoRefresh: true,
    refreshInterval: 5 * 60 * 1000
  });

  const [currentDayIndex, setCurrentDayIndex] = useState(0);

  // Transform unified DayData into chart-specific format
  const processDataByDays = (days: DayData[]): ChartDayData[] => {
    return days.map(day => {
      // Standard time slots for the chart (11 AM to 6 PM)
      const standardTimeSlots = [11, 12, 13, 14, 15, 16, 17, 18];

      // Create a map of hour -> data point for quick lookup
      const hourMap = new Map(day.hourlyData.map(point => [point.hour, point]));

      const processedData = standardTimeSlots.map(hour => {
        const hourData = hourMap.get(hour);

        if (hourData) {
          return {
            time: format(new Date().setHours(hour, 0, 0, 0), 'h a'),
            windSpeed: hourData.windSpeed,
            gustSpeed: hourData.gustSpeed,
            windDirection: hourData.windDirection,
            windDirectionText: hourData.windDirectionText,
            isEmpty: false
          };
        }

        // Empty slot - use null so lines have gaps (connectNulls={false})
        return {
          time: format(new Date().setHours(hour, 0, 0, 0), 'h a'),
          windSpeed: null,
          gustSpeed: null,
          windDirection: null,
          windDirectionText: 'N',
          isEmpty: true
        };
      });

      return {
        date: day.date,
        displayDate: formatInTimeZone(new Date(day.date + 'T12:00:00'), 'America/Los_Angeles', 'EEEE, MMMM d, yyyy'),
        data: processedData
      };
    });
  };

  // Process unified DayData into chart format
  const availableDays: ChartDayData[] = data ? processDataByDays(data) : [];

  const currentDay = availableDays[currentDayIndex] || null;

  // Generate Y-axis ticks dynamically based on data
  const getYAxisTicks = (data: ProcessedDataPoint[]) => {
    if (!data || data.length === 0) return [0, 5, 10, 15, 20];

    const validValues = data.filter(d => d.gustSpeed !== null).map(d => d.gustSpeed || 0);
    if (validValues.length === 0) return [0, 5, 10, 15, 20];

    const maxValue = Math.max(...validValues);
    const domainMax = Math.max(20, Math.ceil(maxValue / 5) * 5);

    const ticks = [];
    for (let i = 0; i <= domainMax; i += 5) {
      ticks.push(i);
    }
    return ticks;
  };


  // Get current timezone name (PST or PDT)
  const getCurrentTimezoneName = () => {
    const now = new Date();
    const timezoneName = formatInTimeZone(now, 'America/Los_Angeles', 'zzz');
    return timezoneName; // Will return 'PST' or 'PDT'
  };

  const navigateToPreviousDay = () => {
    if (currentDayIndex < availableDays.length - 1) {
      setCurrentDayIndex(currentDayIndex + 1);
    }
  };

  const navigateToNextDay = () => {
    if (currentDayIndex > 0) {
      setCurrentDayIndex(currentDayIndex - 1);
    }
  };


  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      if (data.isEmpty || data.windSpeed === null) {
        return (
          <div className="bg-white p-3 rounded-lg shadow-lg border">
            <p className="font-medium text-gray-800">{data.time}</p>
            <p className="text-gray-500">No data available</p>
          </div>
        );
      }

      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border">
          <p className="font-medium text-gray-800">{data.time}</p>
          <p className="text-blue-600">Wind: {data.windSpeed.toFixed(1)} knots</p>
          <p className="text-pink-600">Gust: {data.gustSpeed?.toFixed(1) || 'N/A'} knots</p>
          <p className="text-gray-600">Direction: {data.windDirectionText} ({data.windDirection}°)</p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading wind data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Error Loading Data</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={refresh}
            className="bg-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Wind className="h-6 w-6 text-purple-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Wind History</h1>
                <p className="text-sm text-gray-600">{metadata?.station} • {metadata?.location}</p>
              </div>
            </div>

            <button
              onClick={refresh}
              disabled={isLoading}
              className="p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Day Navigation and Chart */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          {/* Navigation Header */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={navigateToPreviousDay}
              disabled={currentDayIndex >= availableDays.length - 1}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-800">
                {currentDay?.displayDate || 'No Data'}
              </h2>
              <p className="text-sm text-gray-500">
                Day {currentDayIndex + 1} of {availableDays.length} • 11 AM - 6 PM ({getCurrentTimezoneName()})
              </p>
            </div>

            <button
              onClick={navigateToNextDay}
              disabled={currentDayIndex <= 0}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Wind History Line Chart */}
          <div className="h-80 w-full mt-8">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={currentDay?.data || []}
                margin={{ top: 30, right: 20, left: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 12, fill: '#374151', textAnchor: 'start' }}
                  axisLine={{ stroke: '#9ca3af' }}
                  tickLine={{ stroke: '#9ca3af' }}
                  interval={0}
                />
                <YAxis
                  domain={[0, (dataMax: number) => Math.max(20, Math.ceil(dataMax / 5) * 5)]}
                  ticks={getYAxisTicks(currentDay?.data || [])}
                  tick={{ fontSize: 12, fill: '#374151' }}
                  axisLine={{ stroke: '#9ca3af' }}
                  tickLine={{ stroke: '#9ca3af' }}
                  label={{
                    value: 'Wind Speed (knots)',
                    angle: -90,
                    position: 'insideLeft',
                    style: { textAnchor: 'middle', fill: '#374151' }
                  }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine y={10} stroke="#059669" strokeDasharray="3 3" />
                <ReferenceLine y={25} stroke="#dc2626" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="windSpeed"
                  stroke="#374151"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#374151' }}
                  connectNulls={false}
                  name="Average Wind"
                />
                <Line
                  type="monotone"
                  dataKey="gustSpeed"
                  stroke="#6b7280"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#6b7280' }}
                  connectNulls={false}
                  name="Gusts"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Summary for Current Day */}
        {currentDay && (
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-white rounded-lg shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {(() => {
                  const validData = currentDay.data.filter(d => !d.isEmpty && d.windSpeed !== null);
                  if (validData.length === 0) return '0.0';
                  const avg = validData.reduce((sum, d) => sum + (d.windSpeed || 0), 0) / validData.length;
                  return avg.toFixed(1);
                })()}
              </div>
              <div className="text-sm text-gray-600">Average Wind (knots)</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-pink-600">
                {(() => {
                  const validGusts = currentDay.data.filter(d => !d.isEmpty && d.gustSpeed !== null).map(d => d.gustSpeed || 0);
                  if (validGusts.length === 0) return '0.0';
                  return Math.max(...validGusts).toFixed(1);
                })()}
              </div>
              <div className="text-sm text-gray-600">Maximum Gust (knots)</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}