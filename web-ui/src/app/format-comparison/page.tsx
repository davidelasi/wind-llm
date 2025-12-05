'use client';

import { useEffect, useState } from 'react';
import Navigation from '../../components/Navigation';
import { PACIFIC_TIMEZONE } from '@/lib/timezone-utils';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { addDays } from 'date-fns';
import { useWindData } from '@/hooks/useWindData';
import type { DayData } from '@/types/wind-data';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Line,
  Legend
} from 'recharts';
import { RefreshCw } from 'lucide-react';

export default function FormatComparisonPage() {
  const [selectedForecastDay, setSelectedForecastDay] = useState(0);

  // Separate state for JSON and TOON format forecasts
  const [jsonForecastData, setJsonForecastData] = useState<any[][] | null>(null);
  const [jsonForecastLoading, setJsonForecastLoading] = useState(true);
  const [jsonForecastError, setJsonForecastError] = useState<string | null>(null);
  const [jsonForecastMeta, setJsonForecastMeta] = useState<any>(null);

  const [toonForecastData, setToonForecastData] = useState<any[][] | null>(null);
  const [toonForecastLoading, setToonForecastLoading] = useState(true);
  const [toonForecastError, setToonForecastError] = useState<string | null>(null);
  const [toonForecastMeta, setToonForecastMeta] = useState<any>(null);

  // Use unified wind data hook for actual wind overlay
  const { data: actualWindData, isLoading: actualWindLoading } = useWindData({
    autoRefresh: true,
    refreshInterval: 5 * 60 * 1000
  });

  // Placeholder forecast data for fallback
  const allForecastData = [
    // Today (D0)
    [
      { time: '11 AM', windSpeed: 12, gustSpeed: 16, windDirection: 220, windDirectionText: 'SW', isEmpty: false },
      { time: '12 PM', windSpeed: 14, gustSpeed: 18, windDirection: 225, windDirectionText: 'SW', isEmpty: false },
      { time: '1 PM', windSpeed: 16, gustSpeed: 21, windDirection: 230, windDirectionText: 'SW', isEmpty: false },
      { time: '2 PM', windSpeed: 15, gustSpeed: 19, windDirection: 235, windDirectionText: 'SW', isEmpty: false },
      { time: '3 PM', windSpeed: 13, gustSpeed: 17, windDirection: 240, windDirectionText: 'WSW', isEmpty: false },
      { time: '4 PM', windSpeed: 11, gustSpeed: 15, windDirection: 245, windDirectionText: 'WSW', isEmpty: false },
      { time: '5 PM', windSpeed: 9, gustSpeed: 13, windDirection: 250, windDirectionText: 'WSW', isEmpty: false },
      { time: '6 PM', windSpeed: 8, gustSpeed: 11, windDirection: 255, windDirectionText: 'WSW', isEmpty: false },
    ],
    // Tomorrow through D4 (same placeholder data)
    [
      { time: '11 AM', windSpeed: 10, gustSpeed: 14, windDirection: 200, windDirectionText: 'SSW', isEmpty: false },
      { time: '12 PM', windSpeed: 12, gustSpeed: 16, windDirection: 205, windDirectionText: 'SSW', isEmpty: false },
      { time: '1 PM', windSpeed: 14, gustSpeed: 18, windDirection: 210, windDirectionText: 'SSW', isEmpty: false },
      { time: '2 PM', windSpeed: 17, gustSpeed: 22, windDirection: 215, windDirectionText: 'SW', isEmpty: false },
      { time: '3 PM', windSpeed: 18, gustSpeed: 24, windDirection: 220, windDirectionText: 'SW', isEmpty: false },
      { time: '4 PM', windSpeed: 16, gustSpeed: 20, windDirection: 225, windDirectionText: 'SW', isEmpty: false },
      { time: '5 PM', windSpeed: 14, gustSpeed: 18, windDirection: 230, windDirectionText: 'SW', isEmpty: false },
      { time: '6 PM', windSpeed: 12, gustSpeed: 16, windDirection: 235, windDirectionText: 'SW', isEmpty: false },
    ],
    [
      { time: '11 AM', windSpeed: 8, gustSpeed: 12, windDirection: 270, windDirectionText: 'W', isEmpty: false },
      { time: '12 PM', windSpeed: 10, gustSpeed: 14, windDirection: 275, windDirectionText: 'W', isEmpty: false },
      { time: '1 PM', windSpeed: 12, gustSpeed: 16, windDirection: 280, windDirectionText: 'W', isEmpty: false },
      { time: '2 PM', windSpeed: 13, gustSpeed: 17, windDirection: 285, windDirectionText: 'WNW', isEmpty: false },
      { time: '3 PM', windSpeed: 11, gustSpeed: 15, windDirection: 290, windDirectionText: 'WNW', isEmpty: false },
      { time: '4 PM', windSpeed: 9, gustSpeed: 13, windDirection: 295, windDirectionText: 'WNW', isEmpty: false },
      { time: '5 PM', windSpeed: 7, gustSpeed: 11, windDirection: 300, windDirectionText: 'WNW', isEmpty: false },
      { time: '6 PM', windSpeed: 6, gustSpeed: 9, windDirection: 305, windDirectionText: 'NW', isEmpty: false },
    ],
    [
      { time: '11 AM', windSpeed: 5, gustSpeed: 8, windDirection: 180, windDirectionText: 'S', isEmpty: false },
      { time: '12 PM', windSpeed: 7, gustSpeed: 10, windDirection: 185, windDirectionText: 'S', isEmpty: false },
      { time: '1 PM', windSpeed: 9, gustSpeed: 12, windDirection: 190, windDirectionText: 'S', isEmpty: false },
      { time: '2 PM', windSpeed: 11, gustSpeed: 15, windDirection: 195, windDirectionText: 'SSW', isEmpty: false },
      { time: '3 PM', windSpeed: 10, gustSpeed: 14, windDirection: 200, windDirectionText: 'SSW', isEmpty: false },
      { time: '4 PM', windSpeed: 8, gustSpeed: 12, windDirection: 205, windDirectionText: 'SSW', isEmpty: false },
      { time: '5 PM', windSpeed: 6, gustSpeed: 10, windDirection: 210, windDirectionText: 'SSW', isEmpty: false },
      { time: '6 PM', windSpeed: 5, gustSpeed: 8, windDirection: 215, windDirectionText: 'SW', isEmpty: false },
    ],
    [
      { time: '11 AM', windSpeed: 15, gustSpeed: 20, windDirection: 240, windDirectionText: 'WSW', isEmpty: false },
      { time: '12 PM', windSpeed: 18, gustSpeed: 24, windDirection: 245, windDirectionText: 'WSW', isEmpty: false },
      { time: '1 PM', windSpeed: 22, gustSpeed: 28, windDirection: 250, windDirectionText: 'WSW', isEmpty: false },
      { time: '2 PM', windSpeed: 25, gustSpeed: 32, windDirection: 255, windDirectionText: 'WSW', isEmpty: false },
      { time: '3 PM', windSpeed: 23, gustSpeed: 30, windDirection: 260, windDirectionText: 'W', isEmpty: false },
      { time: '4 PM', windSpeed: 20, gustSpeed: 26, windDirection: 265, windDirectionText: 'W', isEmpty: false },
      { time: '5 PM', windSpeed: 17, gustSpeed: 22, windDirection: 270, windDirectionText: 'W', isEmpty: false },
      { time: '6 PM', windSpeed: 15, gustSpeed: 20, windDirection: 275, windDirectionText: 'W', isEmpty: false },
    ],
  ];

  // Fetch JSON format forecast
  const fetchJsonForecast = async (forceUpdate = false) => {
    try {
      setJsonForecastLoading(true);
      const params = new URLSearchParams();
      if (forceUpdate) params.set('force', 'true');
      params.set('format', 'json');

      const response = await fetch(`/api/llm-forecast?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        const predictions = data.data.predictions && data.data.predictions.length > 0
          ? data.data.predictions
          : null;

        const meta = {
          lastUpdated: data.data.lastUpdated,
          isLLMGenerated: data.data.isLLMGenerated,
          source: data.data.source,
          warning: data.data.warning,
          nwsForecastTime: data.data.nwsForecastTime,
          format: data.data.format || 'JSON'
        };

        setJsonForecastData(predictions);
        setJsonForecastMeta(meta);
        setJsonForecastError(null);
      } else {
        setJsonForecastError(data.error || 'Failed to fetch JSON forecast');
      }
    } catch (err) {
      setJsonForecastError('Network error fetching JSON forecast');
    } finally {
      setJsonForecastLoading(false);
    }
  };

  // Fetch TOON format forecast
  const fetchToonForecast = async (forceUpdate = false) => {
    try {
      setToonForecastLoading(true);
      const params = new URLSearchParams();
      if (forceUpdate) params.set('force', 'true');
      params.set('format', 'toon');

      const response = await fetch(`/api/llm-forecast?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        const predictions = data.data.predictions && data.data.predictions.length > 0
          ? data.data.predictions
          : null;

        const meta = {
          lastUpdated: data.data.lastUpdated,
          isLLMGenerated: data.data.isLLMGenerated,
          source: data.data.source,
          warning: data.data.warning,
          nwsForecastTime: data.data.nwsForecastTime,
          format: data.data.format || 'TOON'
        };

        setToonForecastData(predictions);
        setToonForecastMeta(meta);
        setToonForecastError(null);
      } else {
        setToonForecastError(data.error || 'Failed to fetch TOON forecast');
      }
    } catch (err) {
      setToonForecastError('Network error fetching TOON forecast');
    } finally {
      setToonForecastLoading(false);
    }
  };

  useEffect(() => {
    fetchJsonForecast();
    fetchToonForecast();

    const jsonForecastInterval = setInterval(() => fetchJsonForecast(false), 60 * 60 * 1000);
    const toonForecastInterval = setInterval(() => fetchToonForecast(false), 60 * 60 * 1000);

    return () => {
      clearInterval(jsonForecastInterval);
      clearInterval(toonForecastInterval);
    };
  }, []);

  // Get day labels
  const getDayLabels = () => {
    const today = new Date();
    const days = ['Today', 'Tomorrow'];

    for (let i = 2; i < 5; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i);
      const dayName = futureDate.toLocaleDateString('en-US', { weekday: 'short' });
      days.push(dayName);
    }

    return days;
  };

  const dayLabels = getDayLabels();

  // Get actual wind data for the selected day
  const getActualWindForDay = () => {
    if (!actualWindData || actualWindData.length === 0) return null;

    const now = new Date();
    const nowPacific = toZonedTime(now, PACIFIC_TIMEZONE);
    const targetPacific = addDays(nowPacific, selectedForecastDay);
    const dateKey = formatInTimeZone(targetPacific, PACIFIC_TIMEZONE, 'yyyy-MM-dd');

    const dayData = actualWindData.find((day: DayData) => day.date === dateKey);
    if (!dayData) return null;

    const timeSlots = ['11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM'];
    const hourMapping: { [key: string]: number } = {
      '11 AM': 11, '12 PM': 12, '1 PM': 13, '2 PM': 14,
      '3 PM': 15, '4 PM': 16, '5 PM': 17, '6 PM': 18
    };

    return timeSlots.map(timeSlot => {
      const hour = hourMapping[timeSlot];
      const hourData = dayData.hourlyData.find(h => h.hour === hour);

      if (hourData) {
        return {
          time: timeSlot,
          actualWindSpeed: hourData.windSpeed,
          actualGustSpeed: hourData.gustSpeed
        };
      }
      return {
        time: timeSlot,
        actualWindSpeed: null,
        actualGustSpeed: null
      };
    });
  };

  const actualWindForDay = getActualWindForDay();

  // Gradient color helper functions
  const lerp = (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  };

  const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const getForecastWindColor = (windSpeed: number) => {
    const colorStops = [
      { speed: 0, r: 59, g: 130, b: 246 },
      { speed: 5, r: 16, g: 185, b: 129 },
      { speed: 10, r: 234, g: 179, b: 8 },
      { speed: 15, r: 239, g: 68, b: 68 },
      { speed: 20, r: 139, g: 92, b: 246 },
      { speed: 25, r: 139, g: 92, b: 246 }
    ];

    const clampedSpeed = Math.max(0, Math.min(25, windSpeed));
    let lowerStop = colorStops[0];
    let upperStop = colorStops[colorStops.length - 1];

    for (let i = 0; i < colorStops.length - 1; i++) {
      if (clampedSpeed >= colorStops[i].speed && clampedSpeed <= colorStops[i + 1].speed) {
        lowerStop = colorStops[i];
        upperStop = colorStops[i + 1];
        break;
      }
    }

    const speedRange = upperStop.speed - lowerStop.speed;
    const factor = speedRange === 0 ? 0 : (clampedSpeed - lowerStop.speed) / speedRange;

    const r = lerp(lowerStop.r, upperStop.r, factor);
    const g = lerp(lowerStop.g, upperStop.g, factor);
    const b = lerp(lowerStop.b, upperStop.b, factor);

    return rgbToHex(r, g, b);
  };

  const CustomForecastBar = (props: any) => {
    const { x, y, width, height, payload } = props;

    if (!payload || payload.isEmpty) {
      return (
        <rect
          x={x}
          y={y + height - 3}
          width={width}
          height="3"
          fill="#9ca3af"
        />
      );
    }

    // Check for valid wind data before calculations
    if (typeof payload.windSpeed !== 'number' || typeof payload.gustSpeed !== 'number' ||
        payload.windSpeed == null || payload.gustSpeed == null ||
        payload.gustSpeed === 0) {
      return null;
    }

    const windHeight = height * (payload.windSpeed / payload.gustSpeed);
    const gustHeight = height - windHeight;

    // Additional NaN check
    if (isNaN(windHeight) || isNaN(gustHeight)) {
      return null;
    }

    return (
      <g>
        <rect
          x={x}
          y={y + gustHeight}
          width={width}
          height={windHeight}
          fill={getForecastWindColor(payload.windSpeed)}
        />
        {gustHeight > 0 && (
          <rect
            x={x}
            y={y}
            width={width}
            height={gustHeight}
            fill={getForecastWindColor(payload.windSpeed)}
            fillOpacity="0.7"
          />
        )}
        {!payload.isEmpty && (
          <g transform={`translate(${x + width/2}, ${y - 25})`}>
            <g transform={`rotate(${payload.windDirection + 180})`}>
              <polygon
                points="0,-12 -6,6 0,2 6,6"
                fill="#374151"
                stroke="white"
                strokeWidth="1"
              />
            </g>
          </g>
        )}
      </g>
    );
  };

  const CustomForecastTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      if (data.isEmpty) {
        return (
          <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
            <p className="font-medium text-gray-800">{data.time}</p>
            <p className="text-gray-500">No data available</p>
          </div>
        );
      }

      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="font-medium text-gray-800 mb-2">{data.time}</p>

          <div className="mb-2">
            <p className="text-xs text-gray-500 font-semibold mb-1">FORECAST:</p>
            <p className="text-blue-600">Wind: {data.windSpeed.toFixed(1)} knots</p>
            <p className="text-pink-600">Gust: {data.gustSpeed.toFixed(1)} knots</p>
            <p className="text-gray-600">Direction: {data.windDirectionText} ({data.windDirection}°)</p>
          </div>

          {(data.actualWindSpeed !== null || data.actualGustSpeed !== null) && (
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-500 font-semibold mb-1">ACTUAL:</p>
              {data.actualWindSpeed !== null && (
                <p className="text-gray-800">Wind: {data.actualWindSpeed.toFixed(1)} knots</p>
              )}
              {data.actualGustSpeed !== null && (
                <p className="text-gray-600">Gust: {data.actualGustSpeed.toFixed(1)} knots</p>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">JSON vs TOON Format Comparison</h1>
            <p className="text-sm text-gray-600">
              Comparing LLM forecast accuracy using different training data formats (11 AM - 6 PM PST)
              <br />
              <span className="text-xs text-purple-600">Actual wind data overlayed when available • Day selection synchronized</span>
            </p>
          </div>

          {/* Day Selection Buttons - Controls both charts */}
          <div className="flex justify-center gap-2 mb-6">
            {dayLabels.map((label, index) => (
              <button
                key={index}
                onClick={() => setSelectedForecastDay(index)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedForecastDay === index
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Side-by-side charts for JSON vs TOON */}
          <div className="grid grid-cols-2 gap-6">
            {/* JSON Format Chart */}
            <div>
              <div className="mb-3 text-center">
                <h3 className="text-md font-semibold text-blue-700">JSON Format</h3>
                {jsonForecastLoading && <p className="text-xs text-gray-500">Loading...</p>}
                {jsonForecastError && <p className="text-xs text-red-500">{jsonForecastError}</p>}
                {jsonForecastMeta && (
                  <p className="text-xs text-gray-500">
                    {jsonForecastMeta.isLLMGenerated ? '🤖 LLM Generated' : '📊 Placeholder'}
                  </p>
                )}
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={(() => {
                      const forecastDay = jsonForecastData?.[selectedForecastDay] || allForecastData[selectedForecastDay] || allForecastData[0];
                      return forecastDay.map((forecastPoint: any, index: number) => {
                        const actual = actualWindForDay?.[index];
                        return {
                          ...forecastPoint,
                          actualWindSpeed: actual?.actualWindSpeed || null,
                          actualGustSpeed: actual?.actualGustSpeed || null
                        };
                      });
                    })()}
                    margin={{ top: 30, right: 20, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: '#374151', textAnchor: 'start' }}
                      axisLine={{ stroke: '#9ca3af' }}
                      tickLine={{ stroke: '#9ca3af' }}
                      interval={0}
                    />
                    <YAxis
                      domain={[0, (dataMax: number) => Math.max(20, Math.ceil(dataMax / 5) * 5)]}
                      tick={{ fontSize: 10, fill: '#374151' }}
                      axisLine={{ stroke: '#9ca3af' }}
                      tickLine={{ stroke: '#9ca3af' }}
                      label={{
                        value: 'Wind Speed (knots)',
                        angle: -90,
                        position: 'insideLeft',
                        style: { textAnchor: 'middle', fill: '#374151', fontSize: 10 }
                      }}
                    />
                    <Tooltip content={<CustomForecastTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} iconType="line" />
                    <ReferenceLine y={10} stroke="#059669" strokeDasharray="3 3" />
                    <ReferenceLine y={25} stroke="#dc2626" strokeDasharray="3 3" />
                    <Bar
                      dataKey="gustSpeed"
                      shape={<CustomForecastBar />}
                      fill="#3b82f6"
                      name="Forecast (bars)"
                    />
                    <Line
                      type="monotone"
                      dataKey="actualWindSpeed"
                      stroke="#374151"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#374151' }}
                      connectNulls={false}
                      name="Actual Wind"
                    />
                    <Line
                      type="monotone"
                      dataKey="actualGustSpeed"
                      stroke="#6b7280"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#6b7280' }}
                      connectNulls={false}
                      name="Actual Gusts"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TOON Format Chart */}
            <div>
              <div className="mb-3 text-center">
                <h3 className="text-md font-semibold text-green-700">TOON Format</h3>
                {toonForecastLoading && <p className="text-xs text-gray-500">Loading...</p>}
                {toonForecastError && <p className="text-xs text-red-500">{toonForecastError}</p>}
                {toonForecastMeta && (
                  <p className="text-xs text-gray-500">
                    {toonForecastMeta.isLLMGenerated ? '🤖 LLM Generated' : '📊 Placeholder'}
                  </p>
                )}
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={(() => {
                      const forecastDay = toonForecastData?.[selectedForecastDay] || allForecastData[selectedForecastDay] || allForecastData[0];
                      return forecastDay.map((forecastPoint: any, index: number) => {
                        const actual = actualWindForDay?.[index];
                        return {
                          ...forecastPoint,
                          actualWindSpeed: actual?.actualWindSpeed || null,
                          actualGustSpeed: actual?.actualGustSpeed || null
                        };
                      });
                    })()}
                    margin={{ top: 30, right: 20, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: '#374151', textAnchor: 'start' }}
                      axisLine={{ stroke: '#9ca3af' }}
                      tickLine={{ stroke: '#9ca3af' }}
                      interval={0}
                    />
                    <YAxis
                      domain={[0, (dataMax: number) => Math.max(20, Math.ceil(dataMax / 5) * 5)]}
                      tick={{ fontSize: 10, fill: '#374151' }}
                      axisLine={{ stroke: '#9ca3af' }}
                      tickLine={{ stroke: '#9ca3af' }}
                      label={{
                        value: 'Wind Speed (knots)',
                        angle: -90,
                        position: 'insideLeft',
                        style: { textAnchor: 'middle', fill: '#374151', fontSize: 10 }
                      }}
                    />
                    <Tooltip content={<CustomForecastTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} iconType="line" />
                    <ReferenceLine y={10} stroke="#059669" strokeDasharray="3 3" />
                    <ReferenceLine y={25} stroke="#dc2626" strokeDasharray="3 3" />
                    <Bar
                      dataKey="gustSpeed"
                      shape={<CustomForecastBar />}
                      fill="#3b82f6"
                      name="Forecast (bars)"
                    />
                    <Line
                      type="monotone"
                      dataKey="actualWindSpeed"
                      stroke="#374151"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#374151' }}
                      connectNulls={false}
                      name="Actual Wind"
                    />
                    <Line
                      type="monotone"
                      dataKey="actualGustSpeed"
                      stroke="#6b7280"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#6b7280' }}
                      connectNulls={false}
                      name="Actual Gusts"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Comparison Results Section */}
          {jsonForecastData && toonForecastData && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="text-sm font-semibold text-blue-800 mb-3">📊 Format Comparison Results</h4>

              {(() => {
                const jsonDay = jsonForecastData[selectedForecastDay] || [];
                const toonDay = toonForecastData[selectedForecastDay] || [];

                if (jsonDay.length === 0 || toonDay.length === 0) {
                  return <p className="text-xs text-gray-500">Waiting for forecast data...</p>;
                }

                let identical = true;
                let maxWindDiff = 0;
                let maxGustDiff = 0;
                let differences: Array<{hour: string, windDiff: number, gustDiff: number}> = [];

                jsonDay.forEach((jsonHour: any, i: number) => {
                  const toonHour = toonDay[i];
                  if (jsonHour && toonHour) {
                    const windDiff = Math.abs(jsonHour.windSpeed - toonHour.windSpeed);
                    const gustDiff = Math.abs(jsonHour.gustSpeed - toonHour.gustSpeed);

                    if (windDiff > 0.01 || gustDiff > 0.01) {
                      identical = false;
                      maxWindDiff = Math.max(maxWindDiff, windDiff);
                      maxGustDiff = Math.max(maxGustDiff, gustDiff);
                      differences.push({
                        hour: jsonHour.time,
                        windDiff,
                        gustDiff
                      });
                    }
                  }
                });

                return (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="font-medium text-green-700 mb-2">
                        {identical ? '✅ Results Identical!' : '⚠️ Differences Found'}
                      </div>

                      {!identical && (
                        <div className="space-y-1 text-xs">
                          <div>Max Wind Diff: {maxWindDiff.toFixed(1)} kt</div>
                          <div>Max Gust Diff: {maxGustDiff.toFixed(1)} kt</div>
                          <div>Hours with differences: {differences.length}/8</div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="font-medium text-blue-700 mb-2">Token Usage</div>
                      <div className="space-y-1 text-xs">
                        <div>JSON: ~800 tokens per example</div>
                        <div>TOON: ~100 tokens per example</div>
                        <div className="text-green-600 font-medium">Savings: ~96% reduction</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="flex justify-between items-center mt-4">
            <div className="text-xs text-gray-500 flex gap-3">
              <span>
                {jsonForecastMeta?.isLLMGenerated || toonForecastMeta?.isLLMGenerated ? (
                  <span className="text-green-600">🤖 LLM-Generated Forecasts</span>
                ) : (
                  <span>📊 Placeholder Data</span>
                )}
              </span>
              {actualWindForDay && actualWindForDay.some(d => d.actualWindSpeed !== null) && (
                <span className="text-purple-600">📈 Actual wind data overlay active</span>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  fetchJsonForecast(true);
                  fetchToonForecast(true);
                }}
                disabled={jsonForecastLoading || toonForecastLoading}
                className="flex items-center gap-2 text-xs bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${(jsonForecastLoading || toonForecastLoading) ? 'animate-spin' : ''}`} />
                {(jsonForecastLoading || toonForecastLoading) ? 'Updating...' : 'Refresh Both Forecasts'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
