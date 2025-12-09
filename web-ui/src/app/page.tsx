'use client';

import { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import { PACIFIC_TIMEZONE } from '@/lib/timezone-utils';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { addDays, format } from 'date-fns';
import { useWindData } from '@/hooks/useWindData';
import { getWindDirectionText, getWindSpeedColor, mapToForecastWindow } from '@/lib/wind-utils';
import type { DayData } from '@/types/wind-data';
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
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, AlertTriangle, Copy, Check } from 'lucide-react';

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
  const [selectedForecastDay, setSelectedForecastDay] = useState(0); // -3=3 days ago, -2=2 days ago, -1=Yesterday, 0=Today, 1=Tomorrow, 2=D2, 3=D3, 4=D4
  const [llmForecastData, setLlmForecastData] = useState<any[][] | null>(null);
  const [llmForecastLoading, setLlmForecastLoading] = useState(true);
  const [llmForecastError, setLlmForecastError] = useState<string | null>(null);
  const [llmForecastMeta, setLlmForecastMeta] = useState<any>(null);
  const [llmPrompt, setLlmPrompt] = useState<string | null>(null);
  const [showLlmPrompt, setShowLlmPrompt] = useState(false);
  const [showDebugSection, setShowDebugSection] = useState(false);
  const [showProcessedForecast, setShowProcessedForecast] = useState(false);
  const [showRawDebugJson, setShowRawDebugJson] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Swipe gesture state
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  // Use unified wind data hook for ALL historical data (like wind-history page)
  const { data: allWindData, isLoading: allWindLoading, error: windDataError } = useWindData({ autoRefresh: true, refreshInterval: 5 * 60 * 1000 });

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
        setLlmPrompt(data.data.llmPrompt || null);

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

  // Get forecast day label from offset
  const getForecastDayLabel = (offset: number) => {
    if (offset === -3) return '3 days ago';
    if (offset === -2) return '2 days ago';
    if (offset === -1) return 'Yesterday';
    if (offset === 0) return 'Today';
    if (offset === 1) return 'Tomorrow';
    // For days 2-4, get the day name
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + offset);
    return futureDate.toLocaleDateString('en-US', { weekday: 'short' });
  };

  // Helper to get looking for date (if applicable)
  const lookingForDate = selectedForecastDay < 0 ? (() => {
    const date = new Date();
    date.setDate(date.getDate() + selectedForecastDay);
    return date.toISOString().split('T')[0];
  })() : null;

  // Copy all debug information to clipboard
  const copyDebugInfo = async () => {
    const errorCount = [llmForecastError, windDataError, forecastError].filter(Boolean).length;

    const debugReport = `
=== CABRILLO WIND DEBUG REPORT ===
Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST
Total Errors: ${errorCount}

--- LLM FORECAST METADATA ---
${llmForecastMeta ? `
Source: ${llmForecastMeta.source || 'Unknown'}
Format: ${llmForecastMeta.format || 'Unknown'}
Is LLM Generated: ${llmForecastMeta.isLLMGenerated ? 'Yes' : 'No'}
Generated: ${llmForecastMeta.lastUpdated ? new Date(llmForecastMeta.lastUpdated).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' PST' : 'Unknown'}
NWS Forecast Issued: ${llmForecastMeta.nwsForecastTime ? new Date(llmForecastMeta.nwsForecastTime).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' PST' : 'Unknown'}
Warning: ${llmForecastMeta.warning || 'None'}
` : 'No LLM forecast metadata available'}
Error: ${llmForecastError || 'None'}

--- WIND DATA DEBUG ---
Data Loaded: ${allWindData ? 'Yes' : 'No'}
${allWindData ? `Days Available: ${allWindData.length}
Available Dates: ${allWindData.map(d => d.date).join(', ')}
Selected Forecast Day: ${selectedForecastDay} (${getForecastDayLabel(selectedForecastDay)})
Looking for Date: ${lookingForDate || 'N/A'}` : ''}
Loading: ${allWindLoading ? 'Yes' : 'No'}
Error: ${windDataError || 'None'}

--- FORECAST DATA DEBUG ---
Forecast Loaded: ${forecastData ? 'Yes' : 'No'}
${forecastData ? `Issued Time: ${new Date(forecastData.issuedTime).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST
Warnings: ${forecastData.warnings?.join(', ') || 'None'}
Has Processed Text: ${forecastData.processed ? 'Yes' : 'No'}
Has Original Text: ${forecastData.original ? 'Yes' : 'No'}` : ''}
Loading: ${forecastLoading ? 'Yes' : 'No'}
Error: ${forecastError || 'None'}

${showProcessedForecast && forecastData?.processed ? `--- PROCESSED FORECAST ---
${forecastData.processed}
` : ''}

${showLlmPrompt && llmPrompt ? `--- LLM PROMPT ---
${llmPrompt}
` : ''}
  `.trim();

    try {
      await navigator.clipboard.writeText(debugReport);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy debug info:', err);
      alert('Failed to copy to clipboard. Debug info logged to console.');
      console.log(debugReport);
    }
  };

  // Swipe gesture handlers for day navigation
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && selectedForecastDay < 4) {
      setSelectedForecastDay(selectedForecastDay + 1);
    } else if (isRightSwipe && selectedForecastDay > -3) {
      setSelectedForecastDay(selectedForecastDay - 1);
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  useEffect(() => {
    // Fetch all data on initial load
    fetchWindData();
    fetchForecastData();
    fetchLlmForecast();
    // Set up different refresh intervals
    const windInterval = setInterval(fetchWindData, 5 * 60 * 1000); // Refresh every 5 minutes
    const forecastInterval = setInterval(fetchForecastData, 60 * 60 * 1000); // Refresh every 1 hour
    const llmForecastInterval = setInterval(() => fetchLlmForecast(false), 60 * 60 * 1000); // Check for new forecasts every hour
    // Note: allWindData refresh now handled by useWindData hook with auto refresh
    const ageUpdateInterval = setInterval(updateDataAges, 60 * 1000); // Update ages every minute

    return () => {
      clearInterval(windInterval);
      clearInterval(forecastInterval);
      clearInterval(llmForecastInterval);
      clearInterval(ageUpdateInterval);
    };
  }, []);

  // Note: getWindDirectionText and getWindSpeedColor now imported from @/lib/wind-utils

  const getWindSpeedCategory = (speed: number) => {
    if (speed < 7) return { category: 'Light', color: 'text-green-600' };
    if (speed < 14) return { category: 'Moderate', color: 'text-blue-600' };
    if (speed < 21) return { category: 'Fresh', color: 'text-orange-600' };
    if (speed < 28) return { category: 'Strong', color: 'text-red-600' };
    return { category: 'Gale', color: 'text-purple-600' };
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

  // Get day labels (supports negative offsets for past days)
  const getDayLabels = () => {
    const today = new Date();
    const days = [];

    // Add past days (-3 to -1)
    for (let offset = -3; offset <= -1; offset++) {
      const pastDate = new Date(today);
      pastDate.setDate(today.getDate() + offset);

      if (offset === -1) {
        days.push('Yesterday');
      } else if (offset === -2) {
        days.push('2 days ago');
      } else if (offset === -3) {
        days.push('3 days ago');
      }
    }

    // Add present and future days (0 to +4)
    const presentFutureLabels = ['Today', 'Tomorrow'];

    for (let i = 2; i < 5; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i);
      const dayName = futureDate.toLocaleDateString('en-US', { weekday: 'short' });
      presentFutureLabels.push(dayName);
    }

    return [...days, ...presentFutureLabels];
  };

  const dayLabels = getDayLabels();

  // Get day name for single day (used by arrow navigation)
  const getDayLabel = (offset: number): string => {
    if (offset === 0) return 'Today';
    if (offset === 1) return 'Tomorrow';
    if (offset === -1) return 'Yesterday';
    if (offset === -2) return '2 days ago';
    if (offset === -3) return '3 days ago';

    // For D+2, D+3, D+4: show day of week
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };

  // Get formatted date for single day (e.g., "Dec 8, 2025")
  const getDateLabel = (offset: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Get forecast data based on mode
  const getCurrentForecastData = () => {
    // For historical days (negative offsets), return empty time slots - no forecast to show
    if (selectedForecastDay < 0) {
      return [
        { time: '11 AM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '12 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '1 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '2 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '3 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '4 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '5 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '6 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
      ];
    }

    // Always use LLM forecast data when available
    if (llmForecastData && llmForecastData[selectedForecastDay]) {
      return llmForecastData[selectedForecastDay];
    }

    // Fallback to placeholder data if LLM forecast not loaded
    return allForecastData[selectedForecastDay] || allForecastData[0];
  };

  const currentForecastData = getCurrentForecastData();

  // Get actual wind data for the selected day (simplified approach from wind-history page)
  const getActualWindForDay = () => {
    if (!allWindData || allWindData.length === 0) {
      return null;
    }

    // Calculate target date for selected day (same logic as wind-history page)
    const now = new Date();
    const nowPacific = toZonedTime(now, PACIFIC_TIMEZONE);
    const targetPacific = addDays(nowPacific, selectedForecastDay);
    const dateKey = formatInTimeZone(targetPacific, PACIFIC_TIMEZONE, 'yyyy-MM-dd');

    // Find the day in our unified data (like findDayByDate from the hook)
    const dayData = allWindData.find(day => day.date === dateKey);

    if (!dayData || !dayData.hourlyData) {
      return null;
    }

    // Standard time slots for the chart (11 AM to 6 PM) - same as wind-history page
    const standardTimeSlots = [11, 12, 13, 14, 15, 16, 17, 18];

    // Create a map of hour -> data point for quick lookup (same as wind-history)
    const hourMap = new Map(dayData.hourlyData.map(point => [point.hour, point]));

    return standardTimeSlots.map(hour => {
      const hourData = hourMap.get(hour);

      if (hourData) {
        return {
          time: format(new Date().setHours(hour, 0, 0, 0), 'h a'),
          actualWindSpeed: hourData.windSpeed,
          actualGustSpeed: hourData.gustSpeed
        };
      }

      return {
        time: format(new Date().setHours(hour, 0, 0, 0), 'h a'),
        actualWindSpeed: null,
        actualGustSpeed: null
      };
    });
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
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                {selectedForecastDay >= 0 ? '5-Day Wind Forecast' : 'Historical Wind Data'}
              </h2>
              <p className="text-sm text-gray-600">
                {selectedForecastDay >= 0
                  ? 'Wind speed and gust predictions for the next few days (11 AM - 6 PM PST)'
                  : 'Historical wind data for selected date (11 AM - 6 PM PST)'
                }
                <br />
                <span className="text-xs text-purple-600">Actual wind data displayed</span>
              </p>
            </div>

          </div>

          {/* Day Navigation - Mobile-First Arrow Design */}
          <div className="flex items-center justify-center gap-2 md:gap-3 mb-4">
            {/* Left Arrow */}
            <button
              onClick={() => setSelectedForecastDay(Math.max(-3, selectedForecastDay - 1))}
              disabled={selectedForecastDay <= -3}
              className={`
                flex items-center justify-center
                min-w-[44px] min-h-[44px] md:min-w-[48px] md:min-h-[48px]
                rounded-lg transition-all
                ${selectedForecastDay <= -3
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm'
                }
              `}
              aria-label="Previous day"
            >
              <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
            </button>

            {/* Day Label - Two Lines */}
            <div className="flex flex-col items-center min-w-[120px] md:min-w-[160px] text-center">
              <div className="text-base md:text-lg font-semibold text-gray-900">
                {getDayLabel(selectedForecastDay)}
              </div>
              <div className="text-xs md:text-sm text-gray-600">
                {getDateLabel(selectedForecastDay)}
              </div>
            </div>

            {/* Right Arrow */}
            <button
              onClick={() => setSelectedForecastDay(Math.min(4, selectedForecastDay + 1))}
              disabled={selectedForecastDay >= 4}
              className={`
                flex items-center justify-center
                min-w-[44px] min-h-[44px] md:min-w-[48px] md:min-h-[48px]
                rounded-lg transition-all
                ${selectedForecastDay >= 4
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm'
                }
              `}
              aria-label="Next day"
            >
              <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>

          {/* Forecast Metadata Display - Simplified */}
          {selectedForecastDay >= 0 && llmForecastMeta && (
            <div className="mb-4 space-y-1 text-xs md:text-sm">
              {/* Generation timestamp */}
              <div className="text-gray-700">
                <span className="font-medium text-gray-900">Forecast generated:</span>{' '}
                {new Date(llmForecastMeta.lastUpdated).toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: 'America/Los_Angeles'
                })} PST
              </div>

              {/* NWS issuance timestamp */}
              <div className="text-gray-700">
                <span className="font-medium text-gray-900">Based on NWS forecast:</span>{' '}
                {new Date(llmForecastMeta.nwsForecastTime).toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: 'America/Los_Angeles'
                })} PST
              </div>

              {/* Source indicator */}
              <div className="text-xs text-gray-600">
                <span className="font-medium">Source: </span>
                <span className={`${
                  llmForecastMeta.source === 'fresh_llm' ? 'text-green-700' :
                  llmForecastMeta.source?.includes('cache') ? 'text-blue-700' :
                  llmForecastMeta.source?.includes('dummy') ? 'text-orange-700' :
                  'text-gray-700'
                }`}>
                  {llmForecastMeta.source === 'fresh_llm' ? '✓ Fresh LLM prediction' :
                   llmForecastMeta.source === 'cache' ? '💾 Cached' :
                   llmForecastMeta.source === 'cache_fallback' ? '💾 Cached (NWS unavailable)' :
                   llmForecastMeta.source === 'cache_llm_failed' ? '💾 Cached (generation failed)' :
                   llmForecastMeta.source === 'dummy_data_nws_failed' ? '⚠️ Sample data (NWS unavailable)' :
                   llmForecastMeta.source === 'dummy_data_llm_failed' ? '⚠️ Sample data (LLM failed)' :
                   `${llmForecastMeta.source || 'Unknown'}`}
                </span>
                {llmForecastMeta.format && (
                  <span className="text-gray-500 ml-1">• {llmForecastMeta.format}</span>
                )}
              </div>

              {/* Warning (if present) */}
              {llmForecastMeta.warning && (
                <div className="text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded border border-orange-200 inline-block">
                  ⚠️ {llmForecastMeta.warning}
                </div>
              )}
            </div>
          )}

          {/* Y-Axis Label - Horizontal Above Chart */}
          <div className="flex justify-start mb-2 ml-2">
            <span className="text-xs md:text-sm font-medium text-gray-700">
              Wind Speed (knots)
            </span>
          </div>

          <div
            className="h-80 w-full touch-pan-y"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={mergedChartData}
                margin={{ top: 10, right: 20, left: 20, bottom: 20 }}
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
                />
                <Tooltip content={<CustomForecastTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  iconType="line"
                />
                <ReferenceLine y={10} stroke="#059669" strokeDasharray="3 3" />
                <ReferenceLine y={25} stroke="#dc2626" strokeDasharray="3 3" />

                {/* Forecast bars - only show for future/present days */}
                {selectedForecastDay >= 0 && (
                  <Bar
                    dataKey="gustSpeed"
                    shape={<CustomForecastBar />}
                    fill="#3b82f6"
                    name="Forecast (bars)"
                  />
                )}

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

          {/* Comparison Results Section removed - now using separate comparison page at /format-comparison */}

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
            <div className="p-6 text-center">
              <div className="text-gray-500 mb-4">Unable to load area forecast</div>
              <button
                onClick={fetchForecastData}
                className="text-sm bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition-colors"
              >
                Retry
              </button>
              <div className="mt-2 text-xs text-gray-500">
                See debug section below for details
              </div>
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

        {/* ========================================
            CONSOLIDATED DEBUG SECTION
            ======================================== */}
        <div className={`mt-8 bg-white rounded-lg shadow-lg overflow-hidden border-l-4 ${
          (llmForecastError || windDataError || forecastError) ? 'border-red-500' : 'border-gray-300'
        }`}>
          {/* Debug Section Header - Always Visible */}
          <div
            className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setShowDebugSection(!showDebugSection)}
          >
            <div className="flex items-center space-x-3">
              {showDebugSection ? (
                <ChevronUp className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              )}
              <h3 className="text-lg font-semibold text-gray-900">
                Debug & Technical Information
              </h3>
              {/* Error Badge */}
              {(llmForecastError || windDataError || forecastError) && (
                <span className="inline-flex items-center space-x-1 text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  <span>
                    {[llmForecastError, windDataError, forecastError].filter(Boolean).length} error(s)
                  </span>
                </span>
              )}
            </div>
            {showDebugSection && (
              <div className="flex items-center gap-2">
                {/* Refresh Forecast Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchLlmForecast(true);
                  }}
                  disabled={llmForecastLoading}
                  className="flex items-center space-x-2 text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {llmForecastLoading ? (
                    <>
                      <div className="w-3 h-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Refresh Forecast</span>
                    </>
                  )}
                </button>

                {/* Copy Debug Info button (existing) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyDebugInfo();
                  }}
                  className="flex items-center space-x-2 text-sm bg-gray-600 text-white px-3 py-1.5 rounded hover:bg-gray-700 transition-colors"
                >
                  {copySuccess ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Debug Info</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Debug Section Content - Collapsible */}
          {showDebugSection && (
            <div className="p-6 space-y-6 bg-gray-50 border-t border-gray-200">

              {/* 1. LLM Forecast Metadata */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold mr-2">1</span>
                  LLM Forecast Metadata
                </h4>
                <div className="space-y-2 text-sm font-mono">
                  {llmForecastMeta ? (
                    <>
                      <div className="flex">
                        <span className="text-gray-600 w-32">Source:</span>
                        <span className="text-gray-900 font-semibold">{llmForecastMeta.source || 'Unknown'}</span>
                      </div>
                      <div className="flex">
                        <span className="text-gray-600 w-32">Format:</span>
                        <span className="text-gray-900">{llmForecastMeta.format || 'Unknown'}</span>
                      </div>
                      <div className="flex">
                        <span className="text-gray-600 w-32">Is LLM Generated:</span>
                        <span className="text-gray-900">{llmForecastMeta.isLLMGenerated ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="flex">
                        <span className="text-gray-600 w-32">Generated:</span>
                        <span className="text-gray-900">
                          {llmForecastMeta.lastUpdated
                            ? new Date(llmForecastMeta.lastUpdated).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' PST'
                            : 'Unknown'}
                        </span>
                      </div>
                      <div className="flex">
                        <span className="text-gray-600 w-32">NWS Issued:</span>
                        <span className="text-gray-900">
                          {llmForecastMeta.nwsForecastTime
                            ? new Date(llmForecastMeta.nwsForecastTime).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' PST'
                            : 'Unknown'}
                        </span>
                      </div>
                      {llmForecastMeta.warning && (
                        <div className="flex">
                          <span className="text-gray-600 w-32">Warning:</span>
                          <span className="text-orange-700 font-medium">{llmForecastMeta.warning}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-gray-500 italic">No LLM forecast metadata available</div>
                  )}
                  {llmForecastError && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                      <div className="flex">
                        <span className="text-red-600 w-32 font-semibold">Error:</span>
                        <span className="text-red-700">{llmForecastError}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Wind Data Debug */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold mr-2">2</span>
                  Wind Data Debug
                </h4>
                <div className="space-y-2 text-sm font-mono">
                  <div className="flex">
                    <span className="text-gray-600 w-48">Data Loaded:</span>
                    <span className="text-gray-900 font-semibold">{allWindData ? 'Yes' : 'No'}</span>
                  </div>
                  {allWindData && (
                    <>
                      <div className="flex">
                        <span className="text-gray-600 w-48">Days Available:</span>
                        <span className="text-gray-900">{allWindData.length}</span>
                      </div>
                      <div className="flex flex-wrap">
                        <span className="text-gray-600 w-48">Available Dates:</span>
                        <span className="text-gray-900 flex-1">{allWindData.map(d => d.date).join(', ')}</span>
                      </div>
                      <div className="flex">
                        <span className="text-gray-600 w-48">Selected Forecast Day:</span>
                        <span className="text-gray-900">{selectedForecastDay} ({getForecastDayLabel(selectedForecastDay)})</span>
                      </div>
                      {lookingForDate && (
                        <div className="flex">
                          <span className="text-gray-600 w-48">Looking for Date:</span>
                          <span className="text-gray-900">{lookingForDate}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex">
                    <span className="text-gray-600 w-48">Loading:</span>
                    <span className="text-gray-900">{allWindLoading ? 'Yes' : 'No'}</span>
                  </div>
                  {windDataError && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                      <div className="flex">
                        <span className="text-red-600 w-48 font-semibold">Error:</span>
                        <span className="text-red-700">{windDataError}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Forecast Data Debug */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold mr-2">3</span>
                  Forecast Data Debug
                </h4>
                <div className="space-y-2 text-sm font-mono">
                  <div className="flex">
                    <span className="text-gray-600 w-48">Forecast Loaded:</span>
                    <span className="text-gray-900 font-semibold">{forecastData ? 'Yes' : 'No'}</span>
                  </div>
                  {forecastData && (
                    <>
                      <div className="flex">
                        <span className="text-gray-600 w-48">Issued Time:</span>
                        <span className="text-gray-900">
                          {new Date(forecastData.issuedTime).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST
                        </span>
                      </div>
                      <div className="flex flex-wrap">
                        <span className="text-gray-600 w-48">Warnings:</span>
                        <span className="text-gray-900 flex-1">{forecastData.warnings?.join(', ') || 'None'}</span>
                      </div>
                      <div className="flex">
                        <span className="text-gray-600 w-48">Has Processed Text:</span>
                        <span className="text-gray-900">{forecastData.processed ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="flex">
                        <span className="text-gray-600 w-48">Has Original Text:</span>
                        <span className="text-gray-900">{forecastData.original ? 'Yes' : 'No'}</span>
                      </div>
                    </>
                  )}
                  <div className="flex">
                    <span className="text-gray-600 w-48">Loading:</span>
                    <span className="text-gray-900">{forecastLoading ? 'Yes' : 'No'}</span>
                  </div>
                  {forecastError && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                      <div className="flex">
                        <span className="text-red-600 w-48 font-semibold">Error:</span>
                        <span className="text-red-700">{forecastError}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Processed Forecast - Collapsible */}
              {forecastData?.processed && (
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setShowProcessedForecast(!showProcessedForecast)}
                  >
                    <h4 className="text-sm font-semibold text-gray-900 flex items-center">
                      <span className="w-6 h-6 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center text-xs font-bold mr-2">4</span>
                      Processed Forecast (LLM Input)
                    </h4>
                    {showProcessedForecast ? (
                      <ChevronUp className="w-4 h-4 text-gray-600" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-600" />
                    )}
                  </div>
                  {showProcessedForecast && (
                    <div className="mt-3 p-3 bg-gray-900 text-green-400 rounded font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                      {forecastData.processed}
                    </div>
                  )}
                </div>
              )}

              {/* 5. LLM Prompt - Collapsible */}
              {llmPrompt && (
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setShowLlmPrompt(!showLlmPrompt)}
                  >
                    <h4 className="text-sm font-semibold text-gray-900 flex items-center">
                      <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold mr-2">5</span>
                      LLM Prompt
                    </h4>
                    {showLlmPrompt ? (
                      <ChevronUp className="w-4 h-4 text-gray-600" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-600" />
                    )}
                  </div>
                  {showLlmPrompt && (
                    <div className="mt-3 p-3 bg-gray-900 text-blue-400 rounded font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                      {llmPrompt}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>

        </div>
      </div>
    </div>
  );
}
