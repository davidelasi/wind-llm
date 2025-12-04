'use client';

import { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Legend
} from 'recharts';

interface WindData {
  datetime: string;
  windDirection: number;
  windSpeed: number;
  gustSpeed: number;
  pressure: number;
  airTemp: number;
  waterTemp: number;
}

interface DataAge {
  minutes: number;
  isOld: boolean;
  warning: string | null;
  timestamp: string;
}

interface WindApiResponse {
  success: boolean;
  data?: WindData;
  dataAge?: DataAge;
  station?: string;
  location?: string;
  lastUpdated?: string;
  error?: string;
  message?: string;
  debug?: any;
}

interface ProcessedForecast {
  processed: string;
  original: string;
  issuedTime: string;
  warnings: string[];
}

interface ForecastApiResponse {
  success: boolean;
  data?: ProcessedForecast;
  error?: string;
  message?: string;
  debug?: any;
}

interface NoaaWindData {
  timestamp: string;
  windSpeed: number;
  windSpeedUnit: string;
  windDirection: number;
  windGust: number | null;
  windGustUnit: string | null;
}

interface NoaaApiResponse {
  success: boolean;
  data?: NoaaWindData;
  dataAge?: DataAge;
  station?: string;
  location?: string;
  error?: string;
  message?: string;
  debug?: any;
}

interface HourlyWindData {
  hour: string;
  datetimePST: string;
  windSpeedAvgKt: number;
  gustSpeedMaxKt: number;
  windDirection: number;
  pressure: number;
  airTemp: number;
  sampleCount: number;
}

interface DailyWindData {
  date: string;
  hourlyData: HourlyWindData[];
  dailySummary: {
    avgWindSpeedKt: number;
    maxGustKt: number;
    avgDirection: number;
    avgPressure: number;
    avgAirTemp: number;
  };
}


export default function Home() {
  const [windData, setWindData] = useState<WindData | null>(null);
  const [windDataAge, setWindDataAge] = useState<DataAge | null>(null);
  const [forecastData, setForecastData] = useState<ProcessedForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [forecastDebugInfo, setForecastDebugInfo] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [lastForecastUpdate, setLastForecastUpdate] = useState<string>('');
  const [showDebug, setShowDebug] = useState(false);
  const [showForecastDebug, setShowForecastDebug] = useState(false);
  const [showOriginalForecast, setShowOriginalForecast] = useState(false);
  const [selectedForecastDay, setSelectedForecastDay] = useState(0); // 0=Today, 1=Tomorrow, 2=D2, 3=D3, 4=D4
  const [llmForecastData, setLlmForecastData] = useState<any[][] | null>(null);
  const [llmForecastLoading, setLlmForecastLoading] = useState(true);
  const [llmForecastError, setLlmForecastError] = useState<string | null>(null);
  const [useLlmForecast, setUseLlmForecast] = useState(true);
  const [llmForecastMeta, setLlmForecastMeta] = useState<any>(null);
  const [actualWindData, setActualWindData] = useState<any>(null);
  const [actualWindLoading, setActualWindLoading] = useState(true);

  const fetchWindData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/wind-data');
      const data: WindApiResponse = await response.json();

      // Always capture debug info if available
      setDebugInfo(data.debug || null);

      if (data.success && data.data) {
        setWindData(data.data);
        setWindDataAge(data.dataAge || null);
        setLastUpdate(new Date().toLocaleTimeString());
        setError(null);
      } else {
        setError(data.message || 'Failed to fetch wind data');
        console.error('API Error:', data);
      }
    } catch (err) {
      setError('Network error');
      console.error('Fetch Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchForecastData = async () => {
    try {
      setForecastLoading(true);
      const response = await fetch('/api/area-forecast');
      const data: ForecastApiResponse = await response.json();

      // Always capture debug info if available
      setForecastDebugInfo(data.debug || null);

      if (data.success && data.data) {
        setForecastData(data.data);
        setLastForecastUpdate(new Date().toLocaleTimeString());
        setForecastError(null);
      } else {
        setForecastError(data.message || 'Failed to fetch forecast data');
        console.error('Forecast API Error:', data);
      }
    } catch (err) {
      setForecastError('Network error');
      console.error('Forecast Fetch Error:', err);
    } finally {
      setForecastLoading(false);
    }
  };


  // Function to update data ages in real-time
  const updateDataAges = () => {
    const now = new Date();

    if (windDataAge) {
      const originalTimestamp = new Date(windDataAge.timestamp.replace(' PST', ''));
      const updatedMinutes = Math.floor((now.getTime() - originalTimestamp.getTime()) / (1000 * 60));
      setWindDataAge({
        ...windDataAge,
        minutes: updatedMinutes,
        isOld: updatedMinutes > 12,
        warning: updatedMinutes > 12 ? `WARNING: Latest station reading ${updatedMinutes} min ago` : null
      });
    }
  };

  const fetchLlmForecast = async (forceUpdate = false) => {
    try {
      setLlmForecastLoading(true);
      const params = new URLSearchParams();
      if (forceUpdate) params.set('force', 'true');
      if (!useLlmForecast) params.set('test', 'true');

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

        setLlmForecastData(predictions);
        setLlmForecastMeta(meta);

        setLlmForecastError(null);
      } else {
        setLlmForecastError(data.error || 'Failed to fetch LLM forecast');
        if (typeof console !== 'undefined') {
          console.error('LLM Forecast Error:', data);
        }
      }
    } catch (err) {
      setLlmForecastError('Network error fetching LLM forecast');
      if (typeof console !== 'undefined') {
        console.error('LLM Fetch Error:', err);
      }
    } finally {
      setLlmForecastLoading(false);
    }
  };

  const fetchActualWindData = async () => {
    try {
      setActualWindLoading(true);
      const response = await fetch('/api/five-day-wind');
      const data = await response.json();

      if (data.success && data.data && data.data.length > 0) {
        setActualWindData(data.data);
      } else {
        setActualWindData(null);
      }
    } catch (err) {
      console.error('Error fetching actual wind data:', err);
      setActualWindData(null);
    } finally {
      setActualWindLoading(false);
    }
  };


  useEffect(() => {
    // Fetch all data on initial load
    fetchWindData();
    fetchForecastData();
    fetchLlmForecast();
    fetchActualWindData();

    // Set up different refresh intervals
    const windInterval = setInterval(fetchWindData, 5 * 60 * 1000); // Refresh every 5 minutes
    const forecastInterval = setInterval(fetchForecastData, 60 * 60 * 1000); // Refresh every 1 hour
    const llmForecastInterval = setInterval(() => fetchLlmForecast(false), 60 * 60 * 1000); // Check for new forecasts every hour
    const actualWindInterval = setInterval(fetchActualWindData, 5 * 60 * 1000); // Refresh actual wind data every 5 minutes
    const ageUpdateInterval = setInterval(updateDataAges, 60 * 1000); // Update ages every minute

    return () => {
      clearInterval(windInterval);
      clearInterval(forecastInterval);
      clearInterval(llmForecastInterval);
      clearInterval(actualWindInterval);
      clearInterval(ageUpdateInterval);
    };
  }, [useLlmForecast]);

  const getWindDirectionText = (degrees: number) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  };

  const getWindSpeedCategory = (speed: number) => {
    if (speed < 7) return { category: 'Light', color: 'text-green-600' };
    if (speed < 14) return { category: 'Moderate', color: 'text-blue-600' };
    if (speed < 21) return { category: 'Fresh', color: 'text-orange-600' };
    if (speed < 28) return { category: 'Strong', color: 'text-red-600' };
    return { category: 'Gale', color: 'text-purple-600' };
  };

  const getWindSpeedColor = (speed: number) => {
    if (speed < 7) return 'bg-green-500';
    if (speed < 14) return 'bg-blue-500';
    if (speed < 21) return 'bg-orange-500';
    if (speed < 28) return 'bg-red-500';
    return 'bg-purple-500';
  };

  const getWindDirectionArrow = (degrees: number) => {
    // Convert to CSS rotation (wind direction is where wind is coming FROM)
    const rotation = degrees + 180; // Add 180 to show where wind is blowing TO
    return rotation;
  };

  const formatDateForDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading && !windData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-100 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading wind data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-6 text-center max-w-lg w-full">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>

          {debugInfo && (
            <div className="mb-4">
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="text-sm text-blue-600 hover:text-blue-800 underline mb-2"
              >
                {showDebug ? 'Hide' : 'Show'} Debug Info
              </button>

              {showDebug && (
                <div className="bg-gray-100 p-4 rounded-lg text-left text-xs overflow-auto max-h-64">
                  <h4 className="font-bold mb-2">Debug Information:</h4>
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(debugInfo, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={fetchWindData}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>

            <button
              onClick={() => window.open('/api/wind-data', '_blank')}
              className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Test API Directly
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!windData) {
    return null;
  }

  const windCategory = getWindSpeedCategory(windData.windSpeed);
  const windDir = getWindDirectionText(windData.windDirection);

  // Placeholder forecast data for each day (5 days total)
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
    // Tomorrow (D1)
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
    // Day 2 (D2)
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
    // Day 3 (D3)
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
    // Day 4 (D4)
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

  // Get forecast data based on mode
  const getCurrentForecastData = () => {
    if (!useLlmForecast) {
      return allForecastData[selectedForecastDay] || allForecastData[0];
    }

    return llmForecastData && llmForecastData[selectedForecastDay]
      ? llmForecastData[selectedForecastDay]
      : allForecastData[selectedForecastDay] || allForecastData[0];
  };

  const currentForecastData = getCurrentForecastData();

  // Get actual wind data for the selected day
  const getActualWindForDay = () => {
    if (!actualWindData || actualWindData.length === 0) {
      console.log('[DEBUG] No actual wind data available');
      return null;
    }

    console.log('[DEBUG] Actual wind data:', actualWindData);
    console.log('[DEBUG] Number of days in actual data:', actualWindData.length);
    console.log('[DEBUG] Available dates:', actualWindData.map((d: any) => d.date));

    // Calculate the date for the selected day in PST
    const today = new Date();

    // Convert to PST by getting the localized date string
    const pstDateString = today.toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    // Parse the MM/DD/YYYY format to YYYY-MM-DD
    const [month, day, year] = pstDateString.split('/');
    const todayPST = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

    // Add the selected day offset
    const targetDate = new Date(todayPST);
    targetDate.setDate(todayPST.getDate() + selectedForecastDay);
    const dateKey = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log('[DEBUG] Selected forecast day:', selectedForecastDay);
    console.log('[DEBUG] Target date key:', dateKey);

    // Find the matching day in actual wind data
    const dayData = actualWindData.find((day: any) => day.date === dateKey);

    if (!dayData) {
      console.log('[DEBUG] No matching day found for date:', dateKey);
      return null;
    }

    if (!dayData.hourlyData) {
      console.log('[DEBUG] Day found but no hourly data');
      return null;
    }

    console.log('[DEBUG] Found day data:', dayData);
    console.log('[DEBUG] Hours available:', dayData.hourlyData.map((h: any) => h.hour));

    // Map hourly data to match forecast format (11 AM to 6 PM)
    const timeSlots = ['11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM'];
    const hourMapping: { [key: string]: number } = {
      '11 AM': 11, '12 PM': 12, '1 PM': 13, '2 PM': 14,
      '3 PM': 15, '4 PM': 16, '5 PM': 17, '6 PM': 18
    };

    const result = timeSlots.map(timeSlot => {
      const hour = hourMapping[timeSlot];
      const hourData = dayData.hourlyData.find((h: any) => parseInt(h.hour.split(':')[0]) === hour);

      if (hourData) {
        console.log(`[DEBUG] Found data for ${timeSlot}:`, hourData);
        return {
          time: timeSlot,
          actualWindSpeed: hourData.windSpeedAvgKt,
          actualGustSpeed: hourData.gustSpeedMaxKt
        };
      }
      console.log(`[DEBUG] No data for ${timeSlot}`);
      return {
        time: timeSlot,
        actualWindSpeed: null,
        actualGustSpeed: null
      };
    });

    console.log('[DEBUG] Final result:', result);
    return result;
  };

  const actualWindForDay = getActualWindForDay();

  // Merge forecast and actual data for the chart
  const mergedChartData = currentForecastData.map((forecastPoint: any, index: number) => {
    const actual = actualWindForDay?.[index];
    return {
      ...forecastPoint,
      actualWindSpeed: actual?.actualWindSpeed || null,
      actualGustSpeed: actual?.actualGustSpeed || null
    };
  });

  // Linear interpolation between two values
  const lerp = (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  };

  // Convert RGB values to hex
  const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // Get color for wind speed using smooth gradient transitions (original from Wind History)
  const getForecastWindColor = (windSpeed: number) => {
    // Define color stops with RGB values
    const colorStops = [
      { speed: 0, r: 59, g: 130, b: 246 },   // Blue #3b82f6
      { speed: 5, r: 16, g: 185, b: 129 },   // Green #10b981
      { speed: 10, r: 234, g: 179, b: 8 },   // Yellow #eab308
      { speed: 15, r: 239, g: 68, b: 68 },   // Red #ef4444
      { speed: 20, r: 139, g: 92, b: 246 },  // Purple #8b5cf6
      { speed: 25, r: 139, g: 92, b: 246 }   // Purple (cap)
    ];

    // Clamp wind speed to our range
    const clampedSpeed = Math.max(0, Math.min(25, windSpeed));

    // Find the two color stops to interpolate between
    let lowerStop = colorStops[0];
    let upperStop = colorStops[colorStops.length - 1];

    for (let i = 0; i < colorStops.length - 1; i++) {
      if (clampedSpeed >= colorStops[i].speed && clampedSpeed <= colorStops[i + 1].speed) {
        lowerStop = colorStops[i];
        upperStop = colorStops[i + 1];
        break;
      }
    }

    // Calculate interpolation factor
    const speedRange = upperStop.speed - lowerStop.speed;
    const factor = speedRange === 0 ? 0 : (clampedSpeed - lowerStop.speed) / speedRange;

    // Interpolate RGB values
    const r = lerp(lowerStop.r, upperStop.r, factor);
    const g = lerp(lowerStop.g, upperStop.g, factor);
    const b = lerp(lowerStop.b, upperStop.b, factor);

    return rgbToHex(r, g, b);
  };

  // Generate Y-axis ticks dynamically based on data
  const getYAxisTicks = (data: any[]) => {
    if (!data || data.length === 0) return [0, 5, 10, 15, 20];

    // Consider both forecast and actual data
    const values = data.flatMap(d => [
      d.gustSpeed || 0,
      d.actualGustSpeed || 0,
      d.actualWindSpeed || 0
    ]);
    const maxValue = Math.max(...values);
    const domainMax = Math.max(20, Math.ceil(maxValue / 5) * 5);

    const ticks = [];
    for (let i = 0; i <= domainMax; i += 5) {
      ticks.push(i);
    }
    return ticks;
  };

  // Custom bar component (original from Wind History)
  const CustomForecastBar = (props: any) => {
    const { x, y, width, height, payload } = props;

    if (!payload) return null;

    if (payload.isEmpty) {
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

    const windHeight = height * (payload.windSpeed / payload.gustSpeed);
    const gustHeight = height - windHeight;

    return (
      <g>
        {/* Wind speed bar - color based on wind speed */}
        <rect
          x={x}
          y={y + gustHeight}
          width={width}
          height={windHeight}
          fill={getForecastWindColor(payload.windSpeed)}
        />

        {/* Additional gust - darker shade of the same color */}
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

        {/* Wind direction arrow */}
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

  // Custom tooltip (original from Wind History)
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

          {/* Forecast Data */}
          <div className="mb-2">
            <p className="text-xs text-gray-500 font-semibold mb-1">FORECAST:</p>
            <p className="text-blue-600">Wind: {data.windSpeed.toFixed(1)} knots</p>
            <p className="text-pink-600">Gust: {data.gustSpeed.toFixed(1)} knots</p>
            <p className="text-gray-600">Direction: {data.windDirectionText} ({data.windDirection}°)</p>
          </div>

          {/* Actual Data (if available) */}
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
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="bg-gray-100 min-h-[calc(100vh-64px)] px-4 py-6">
        <div className="max-w-4xl mx-auto">


        {/* Wind Forecast Chart */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">5-Day Wind Forecast</h2>
              <p className="text-sm text-gray-600">
                Wind speed and gust predictions for the next few days (11 AM - 6 PM PST)
                <br />
                <span className="text-xs text-purple-600">Actual wind data overlayed when available</span>
              </p>
            </div>

            {/* LLM Controls & Status */}
            <div className="text-right space-y-2">
              {/* LLM Toggle */}
              <div className="flex items-center justify-end gap-3">
                <label className="text-sm text-gray-600">LLM Forecast:</label>
                <button
                  onClick={() => setUseLlmForecast(!useLlmForecast)}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    useLlmForecast
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {useLlmForecast ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Format Selection */}


              {/* Status Information */}
              {llmForecastMeta && (
                <div className="text-xs text-gray-500">
                  <div>
                    <div>Source: {llmForecastMeta.source} ({llmForecastMeta.format})</div>
                    {llmForecastMeta.isLLMGenerated && (
                      <div>Updated: {new Date(llmForecastMeta.lastUpdated).toLocaleTimeString()}</div>
                    )}
                  </div>
                </div>
              )}

              {llmForecastError && (
                <div className="text-xs text-red-600">
                  Error: {llmForecastError}
                </div>
              )}

              {llmForecastMeta?.warning && (
                <div className="text-xs text-yellow-600">
                  ⚠️ {llmForecastMeta.warning}
                </div>
              )}
            </div>
          </div>

          {/* Day Selection Buttons */}
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

          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={mergedChartData}
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
                  ticks={getYAxisTicks(mergedChartData)}
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
                <Tooltip content={<CustomForecastTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  iconType="line"
                />
                <ReferenceLine y={10} stroke="#059669" strokeDasharray="3 3" />
                <ReferenceLine y={25} stroke="#dc2626" strokeDasharray="3 3" />

                {/* Forecast bars */}
                <Bar
                  dataKey="gustSpeed"
                  shape={<CustomForecastBar />}
                  fill="#3b82f6"
                  name="Forecast (bars)"
                />

                {/* Actual wind data lines (same style as wind history page) */}
                <Line
                  type="monotone"
                  dataKey="actualWindSpeed"
                  stroke="#374151"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#374151' }}
                  connectNulls={false}
                  name="Actual Wind"
                />
                <Line
                  type="monotone"
                  dataKey="actualGustSpeed"
                  stroke="#6b7280"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#6b7280' }}
                  connectNulls={false}
                  name="Actual Gusts"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Comparison Results Section removed - now using TOON only */}
          {false && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="text-sm font-semibold text-blue-800 mb-3">📊 Format Comparison Results</h4>

              {(() => {
                const jsonDay = jsonForecastData[selectedForecastDay] || [];
                const toonDay = toonForecastData[selectedForecastDay] || [];

                // Calculate differences
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

          {/* DEBUG INFO */}
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs">
            <p className="font-semibold mb-2">🐛 Debug Info:</p>
            <div className="space-y-1">
              <p>Actual wind data loaded: {actualWindData ? 'Yes' : 'No'}</p>
              {actualWindData && (
                <>
                  <p>Days available: {actualWindData.length}</p>
                  <p>Available dates: {actualWindData.map((d: any) => d.date).join(', ')}</p>
                  <p>Selected forecast day: Day {selectedForecastDay} ({['Today', 'Tomorrow', 'D+2', 'D+3', 'D+4'][selectedForecastDay]})</p>
                  <p>Looking for date: {(() => {
                    const today = new Date();
                    const pstDateString = today.toLocaleDateString('en-US', {
                      timeZone: 'America/Los_Angeles',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit'
                    });
                    const [month, day, year] = pstDateString.split('/');
                    const todayPST = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                    const targetDate = new Date(todayPST);
                    targetDate.setDate(todayPST.getDate() + selectedForecastDay);
                    return targetDate.toISOString().split('T')[0];
                  })()}</p>
                  <p>Match found: {actualWindForDay ? 'Yes' : 'No'}</p>
                  {actualWindForDay && (
                    <p>Hours with data: {actualWindForDay.filter(d => d.actualWindSpeed !== null).length} / 8</p>
                  )}
                </>
              )}
              {actualWindLoading && <p className="text-orange-600">Loading actual wind data...</p>}
            </div>
          </div>

          <div className="flex justify-between items-center mt-4">
            <div className="text-xs text-gray-500 flex gap-3">
              <span>
                {useLlmForecast && llmForecastMeta?.isLLMGenerated ? (
                  <span className="text-green-600">🤖 LLM-Generated Forecast</span>
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
                onClick={() => fetchLlmForecast(true)}
                disabled={llmForecastLoading}
                className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {llmForecastLoading ? 'Updating...' : 'Refresh Forecast'}
              </button>
            </div>
          </div>
        </div>


        {/* Area Forecast Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Area Forecast - Inner Waters</h3>
            <button
              onClick={fetchForecastData}
              disabled={forecastLoading}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {forecastLoading ? 'Loading...' : 'Refresh Forecast'}
            </button>
          </div>

          {forecastError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-red-700 font-medium mb-2">Forecast Error</div>
              <p className="text-red-600 text-sm mb-3">{forecastError}</p>

              {forecastDebugInfo && (
                <div className="mb-3">
                  <button
                    onClick={() => setShowForecastDebug(!showForecastDebug)}
                    className="text-xs text-red-600 hover:text-red-800 underline"
                  >
                    {showForecastDebug ? 'Hide' : 'Show'} Debug Info
                  </button>

                  {showForecastDebug && (
                    <div className="bg-gray-100 p-3 rounded mt-2 text-xs overflow-auto max-h-48">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(forecastDebugInfo, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => window.open('/api/area-forecast', '_blank')}
                className="bg-red-600 text-white px-4 py-2 rounded text-xs hover:bg-red-700"
              >
                Test Forecast API
              </button>
            </div>
          ) : forecastLoading && !forecastData ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
              <p className="text-gray-600 mt-3">Loading forecast...</p>
            </div>
          ) : forecastData ? (
            <div>
              {/* Warnings */}
              {forecastData.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-amber-800 mb-2">⚠️ Weather Warnings</h4>
                  <ul className="text-sm text-amber-700">
                    {forecastData.warnings.map((warning, index) => (
                      <li key={index} className="mb-1">• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Processed Forecast */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-800 mb-3">Processed Forecast</h4>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                  {forecastData.processed}
                </pre>
              </div>

              {/* Original Forecast Toggle */}
              <div className="text-center mb-4">
                <button
                  onClick={() => setShowOriginalForecast(!showOriginalForecast)}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  {showOriginalForecast ? 'Hide' : 'Show'} Original Forecast
                </button>
              </div>

              {showOriginalForecast && (
                <div className="bg-gray-100 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-gray-800 mb-3">Original Forecast</h4>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">
                    {forecastData.original}
                  </pre>
                </div>
              )}

              {/* Forecast Timestamp */}
              <div className="text-center">
                <p className="text-xs text-gray-500">
                  Forecast issued: {new Date(forecastData.issuedTime).toLocaleString()} •
                  Last updated: {lastForecastUpdate}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}
