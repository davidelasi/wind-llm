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
import appConfig from '@/config/app-config.json';
import ForecastLoadingOverlay from '@/components/ForecastLoadingOverlay';

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
  const [selectedForecastDay, setSelectedForecastDay] = useState(0); // 0=Today, 1=Tomorrow, 2=D2, 3=D3, 4=D4
  const [selectedHistoricalDay, setSelectedHistoricalDay] = useState(-1); // -1=Yesterday, -2=2 days ago, -3=3 days ago
  const [llmForecastData, setLlmForecastData] = useState<any[][] | null>(null);
  const [llmForecastLoading, setLlmForecastLoading] = useState(true);
const [generatingFreshForecast, setGeneratingFreshForecast] = useState(false);
const [llmForecastError, setLlmForecastError] = useState<string | null>(null);
const [llmForecastMeta, setLlmForecastMeta] = useState<any>(null);
const [llmPrompt, setLlmPrompt] = useState<string | null>(null);
const [isDummyForecast, setIsDummyForecast] = useState(false);
const [showLlmPrompt, setShowLlmPrompt] = useState(false);
const [showDebugSection, setShowDebugSection] = useState(false);
const [showAreaForecast, setShowAreaForecast] = useState(false);
const [showProcessedForecast, setShowProcessedForecast] = useState(false);
const [showRawDebugJson, setShowRawDebugJson] = useState(false);
const [copySuccess, setCopySuccess] = useState(false);
const [storeWindLoading, setStoreWindLoading] = useState(false);
const [storeWindMessage, setStoreWindMessage] = useState<string | null>(null);

  // Use unified wind data hook for ALL historical data (like wind-history page)
  const granularity = appConfig.windData.displayGranularity as 'hourly' | '6min';
  const { data: allWindData, isLoading: allWindLoading, error: windDataError } = useWindData({
    autoRefresh: true,
    refreshInterval: 5 * 60 * 1000,
    granularity: granularity
  });

  // Separate hook for Current Conditions chart (always 6-minute data for today)
  const { data: granularWindData, isLoading: granularLoading, error: granularError } = useWindData({
    autoRefresh: true,
    refreshInterval: 5 * 60 * 1000,
    granularity: '6min'
  });

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



  // Generate dummy forecast data for localhost testing
  // Creates 5 days with varying wind intensities to exercise the full color range
  const generateDummyForecast = () => {
    const timeLabels = ['11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM'];

    // Day profiles: [baseWind, peakWind, gustAdd, direction]
    // Designed to cover sub-5kt to ~30kt range
    const dayProfiles = [
      // Day 0: Light wind (blue range, 3-8 kt)
      { base: 3, peak: 8, gustAdd: 3, dirBase: 240 },
      // Day 1: Moderate wind (green range, 8-14 kt)
      { base: 8, peak: 14, gustAdd: 4, dirBase: 250 },
      // Day 2: Fresh wind (yellow/orange range, 14-22 kt)
      { base: 14, peak: 22, gustAdd: 5, dirBase: 220 },
      // Day 3: Strong wind (red range, 20-28 kt)
      { base: 20, peak: 28, gustAdd: 6, dirBase: 180 },
      // Day 4: Very strong (purple range, 25-32 kt)
      { base: 25, peak: 32, gustAdd: 5, dirBase: 90 },
    ];

    const dummyPredictions = dayProfiles.map((profile) => {
      return timeLabels.map((time, hourIndex) => {
        // Simulate afternoon wind build-up pattern (peaks around 3-4 PM)
        const buildupFactor = Math.sin((hourIndex / 7) * Math.PI);
        const windRange = profile.peak - profile.base;
        const baseWind = profile.base + buildupFactor * windRange + (Math.random() * 2 - 1);
        const windSpeed = Math.round(Math.max(1, baseWind) * 10) / 10;
        const gustSpeed = Math.round((windSpeed + profile.gustAdd + Math.random() * 2) * 10) / 10;
        // Vary direction slightly through the day
        const windDirection = Math.round(profile.dirBase + (hourIndex - 4) * 5 + Math.random() * 10);

        return {
          time,
          windSpeed,
          gustSpeed,
          windDirection: ((windDirection % 360) + 360) % 360, // Normalize to 0-360
          windDirectionText: getWindDirectionText(windDirection),
          isEmpty: false
        };
      });
    });

    return dummyPredictions;
  };

  // Check if we're on localhost
  const isLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const fetchLlmForecast = async (forceUpdate = false) => {
    // If we already have data, show overlay while generating fresh forecast
    const hasCachedData = llmForecastData !== null;

    // On localhost, always show the overlay animation (even on initial load)
    // Set placeholder data first so the chart renders behind the overlay
    if (isLocalhost && !hasCachedData) {
      const placeholderData = generateDummyForecast();
      setLlmForecastData(placeholderData);
      setLlmForecastMeta({
        lastUpdated: new Date().toISOString(),
        isLLMGenerated: false,
        source: 'loading_placeholder',
        warning: null,
        nwsForecastTime: new Date().toISOString(),
        format: 'LOADING'
      });
      setLlmForecastLoading(false);
    }

    try {
      // On localhost or with cached data, show overlay animation
      if (isLocalhost || hasCachedData) {
        setGeneratingFreshForecast(true);
      } else {
        // No cached data and not localhost, show loading state
        setLlmForecastLoading(true);
      }
      setIsDummyForecast(false);
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
        // On localhost, use dummy forecast data instead of showing error
        if (isLocalhost) {
          // Add configurable delay for localhost testing
          const dummyDelay = (appConfig as any).loadingAnimation?.dummyDelayMs ?? 5000;
          await new Promise(resolve => setTimeout(resolve, dummyDelay));

          const dummyData = generateDummyForecast();
          setLlmForecastData(dummyData);
          setLlmForecastMeta({
            lastUpdated: new Date().toISOString(),
            isLLMGenerated: false,
            source: 'dummy_localhost',
            warning: null,
            nwsForecastTime: new Date().toISOString(),
            format: 'DUMMY'
          });
          setIsDummyForecast(true);
          setLlmForecastError(null);
        } else {
          setLlmForecastError(data.error || 'Failed to fetch LLM forecast');
          if (typeof console !== 'undefined') {
            console.error('LLM Forecast Error:', data);
          }
        }
      }
    } catch (err) {
      // On localhost, use dummy forecast data instead of showing error
      if (isLocalhost) {
        // Add configurable delay for localhost testing
        const dummyDelay = (appConfig as any).loadingAnimation?.dummyDelayMs ?? 5000;
        await new Promise(resolve => setTimeout(resolve, dummyDelay));

        const dummyData = generateDummyForecast();
        setLlmForecastData(dummyData);
        setLlmForecastMeta({
          lastUpdated: new Date().toISOString(),
          isLLMGenerated: false,
          source: 'dummy_localhost',
          warning: null,
          nwsForecastTime: new Date().toISOString(),
          format: 'DUMMY'
        });
        setIsDummyForecast(true);
        setLlmForecastError(null);
      } else {
        setLlmForecastError('Network error fetching LLM forecast');
        if (typeof console !== 'undefined') {
          console.error('LLM Fetch Error:', err);
        }
      }
    } finally {
      setLlmForecastLoading(false);
      setGeneratingFreshForecast(false);
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

  const triggerStoreWindActuals = async () => {
    try {
      setStoreWindLoading(true);
      setStoreWindMessage(null);
      const res = await fetch('/api/cron/store-wind-actuals?manual=true');
      const json = await res.json();
      if (res.ok && json.success) {
        setStoreWindMessage(json.message || 'Stored wind actuals');
      } else {
        setStoreWindMessage(json.error || json.message || 'Failed to store wind actuals');
      }
    } catch (err) {
      setStoreWindMessage('Failed to store wind actuals');
      console.error('Store wind actuals error:', err);
    } finally {
      setStoreWindLoading(false);
    }
  };

  useEffect(() => {
    // Fetch all data on initial load
    fetchWindData();
    fetchForecastData();
    if (appConfig.llmForecast.enabled) {
      fetchLlmForecast();
    } else if (isLocalhost) {
      // On localhost with llmForecast disabled, use dummy data
      const dummyData = generateDummyForecast();
      setLlmForecastData(dummyData);
      setLlmForecastMeta({
        lastUpdated: new Date().toISOString(),
        isLLMGenerated: false,
        source: 'dummy_localhost',
        warning: null,
        nwsForecastTime: new Date().toISOString(),
        format: 'DUMMY'
      });
      setIsDummyForecast(true);
      setLlmForecastLoading(false);
    }
    // Set up different refresh intervals
    const windInterval = setInterval(fetchWindData, 5 * 60 * 1000); // Refresh every 5 minutes
    const forecastInterval = setInterval(fetchForecastData, 60 * 60 * 1000); // Refresh every 1 hour
    let llmForecastInterval: NodeJS.Timeout | null = null;
    if (appConfig.llmForecast.enabled) {
      llmForecastInterval = setInterval(() => fetchLlmForecast(false), 60 * 60 * 1000); // Check for new forecasts every hour
    }
    // Note: allWindData refresh now handled by useWindData hook with auto refresh
    const ageUpdateInterval = setInterval(updateDataAges, 60 * 1000); // Update ages every minute

    return () => {
      clearInterval(windInterval);
      clearInterval(forecastInterval);
      if (llmForecastInterval) clearInterval(llmForecastInterval);
      clearInterval(ageUpdateInterval);
    };
  }, []);

  // Note: getWindDirectionText and getWindSpeedColor now imported from @/lib/wind-utils

  const getWindSpeedCategory = (speed: number) => {
    if (speed < 7) return { category: 'Light', color: 'text-green-600' };
    if (speed < 14) return { category: 'Moderate', color: 'text-[#005F73]' };
    if (speed < 21) return { category: 'Fresh', color: 'text-orange-600' };
    if (speed < 28) return { category: 'Strong', color: 'text-red-600' };
    return { category: 'Gale', color: 'text-[#005F73]' };
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#005F73] mx-auto"></div>
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
                className="text-sm text-[#005F73] hover:text-[#0A9396] underline mb-2"
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
              className="bg-[#005F73] text-white px-6 py-2 rounded-lg hover:bg-[#0A9396] transition-colors"
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

  // Get friendly model name from model ID
  const getModelName = (modelId: string): string => {
    if (!modelId) return 'Unknown Model';

    // Map common model IDs to friendly names
    if (modelId.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
    if (modelId.includes('claude-sonnet-3')) return 'Claude Sonnet 3.5';
    if (modelId.includes('claude-opus')) return 'Claude Opus';

    return modelId; // Return raw ID if no match
  };

  // Get relative date text for when forecast was generated
  const getForecastGenerationTime = (timestamp: string): string => {
    const generatedDate = new Date(timestamp);
    const now = new Date();

    // Convert to PST dates (just date part, ignore time)
    const genDatePST = toZonedTime(generatedDate, PACIFIC_TIMEZONE);
    const nowDatePST = toZonedTime(now, PACIFIC_TIMEZONE);

    const genDay = formatInTimeZone(genDatePST, PACIFIC_TIMEZONE, 'yyyy-MM-dd');
    const todayDay = formatInTimeZone(nowDatePST, PACIFIC_TIMEZONE, 'yyyy-MM-dd');

    if (genDay === todayDay) {
      return 'today';
    }

    // Calculate yesterday
    const yesterday = new Date(nowDatePST);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDay = formatInTimeZone(yesterday, PACIFIC_TIMEZONE, 'yyyy-MM-dd');

    if (genDay === yesterdayDay) {
      return 'yesterday';
    }

    // Otherwise return the formatted date
    return formatInTimeZone(genDatePST, PACIFIC_TIMEZONE, 'MMM d, yyyy');
  };

  // Get relative date text for NWS issuance (today/yesterday or date)
  const getNwsIssuedRelativeTime = (timestamp: string): string => {
    const issuedDate = new Date(timestamp);
    const now = new Date();

    const issuedDatePST = toZonedTime(issuedDate, PACIFIC_TIMEZONE);
    const nowDatePST = toZonedTime(now, PACIFIC_TIMEZONE);

    const issuedDay = formatInTimeZone(issuedDatePST, PACIFIC_TIMEZONE, 'yyyy-MM-dd');
    const todayDay = formatInTimeZone(nowDatePST, PACIFIC_TIMEZONE, 'yyyy-MM-dd');

    if (issuedDay === todayDay) {
      return 'today';
    }

    const yesterday = new Date(nowDatePST);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDay = formatInTimeZone(yesterday, PACIFIC_TIMEZONE, 'yyyy-MM-dd');

    if (issuedDay === yesterdayDay) {
      return 'yesterday';
    }

    return formatInTimeZone(issuedDatePST, PACIFIC_TIMEZONE, 'MMM d');
  };

  // Calculate expected next NWS update time
  // NWS typically issues forecasts around 4 AM, 10 AM, 4 PM, 10 PM PST
  const getNextUpdateText = (nwsForecastTime: string): string => {
    const now = new Date();

    // Get current hour and minute in Pacific time
    const nowHour = parseInt(formatInTimeZone(now, PACIFIC_TIMEZONE, 'H'));
    const nowMinute = parseInt(formatInTimeZone(now, PACIFIC_TIMEZONE, 'm'));

    // Typical NWS issue times (approximate)
    const issueHours = [4, 10, 16, 22]; // 4 AM, 10 AM, 4 PM, 10 PM

    // Find the next issue hour that's in the future
    // If we're within 30 min after an issue hour, treat it as "any time now"
    let nextIssueHour = issueHours.find(h => h > nowHour);

    // Check if we're close to an issue time (within the hour after)
    const justMissedIssue = issueHours.includes(nowHour) ||
      (issueHours.includes(nowHour - 1) && nowMinute < 30);

    if (justMissedIssue) {
      return 'any time now';
    }

    if (nextIssueHour === undefined) {
      nextIssueHour = issueHours[0]; // Wrap to next day's 4 AM
    }

    // Calculate hours until next update
    let hoursUntilNext = nextIssueHour - nowHour;
    if (hoursUntilNext <= 0) {
      hoursUntilNext += 24;
    }

    // Format the response
    if (hoursUntilNext <= 1) {
      return 'in the next hour or so';
    } else if (hoursUntilNext <= 2) {
      return 'in the next couple hours';
    } else {
      // Format as "around X AM/PM"
      const period = nextIssueHour >= 12 ? 'PM' : 'AM';
      const displayHour = nextIssueHour > 12 ? nextIssueHour - 12 : nextIssueHour === 0 ? 12 : nextIssueHour;
      return `around ${displayHour} ${period}`;
    }
  };

  // Get forecast data based on mode
  const getCurrentForecastData = () => {
    const clampForecast = (points: any[]) => points.slice(0, 8);

    // For historical days (negative offsets), return empty time slots - no forecast to show
    if (selectedForecastDay < 0) {
      return clampForecast([
        { time: '11 AM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '12 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '1 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '2 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '3 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '4 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '5 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '6 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
      ]);
    }

    // Always use LLM forecast data when available
    if (llmForecastData && llmForecastData[selectedForecastDay]) {
      return clampForecast(llmForecastData[selectedForecastDay]);
    }

    // If still loading, return empty data (don't show placeholder bars)
    if (llmForecastLoading) {
      return clampForecast([
        { time: '11 AM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '12 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '1 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '2 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '3 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '4 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '5 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
        { time: '6 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
      ]);
    }

    // If there's an error or no data available after loading, also return empty data
    return clampForecast([
      { time: '11 AM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
      { time: '12 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
      { time: '1 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
      { time: '2 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
      { time: '3 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
      { time: '4 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
      { time: '5 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
      { time: '6 PM', windSpeed: 0, gustSpeed: 0, windDirection: 0, windDirectionText: '', isEmpty: true },
    ]);
  };

  const currentForecastData = getCurrentForecastData();

  // Get actual wind data for a specific day offset (simplified approach from wind-history page)
  const getActualWindForDay = (dayOffset: number = selectedForecastDay) => {
    if (!allWindData || allWindData.length === 0) {
      return null;
    }

    // Calculate target date for selected day (same logic as wind-history page)
    const now = new Date();
    const nowPacific = toZonedTime(now, PACIFIC_TIMEZONE);
    const targetPacific = addDays(nowPacific, dayOffset);
    const dateKey = formatInTimeZone(targetPacific, PACIFIC_TIMEZONE, 'yyyy-MM-dd');

    // Find the day in our unified data (like findDayByDate from the hook)
    const dayData = allWindData.find(day => day.date === dateKey);

    if (!dayData || !dayData.hourlyData) {
      return null;
    }

    if (granularity === '6min') {
      // NEW: Return all 6-minute data points in forecast window (10 AM - 6 PM)
      return dayData.hourlyData
        .filter(point => point.hour >= 10 && point.hour <= 18)
        .map(point => {
          const dateTime = new Date(`${point.date}T${point.time}`);
          // For hourly boundaries (XX:00), use "11 AM" format to match forecast
          // For 6-minute intervals, use "11:06 AM" format
          const minutes = dateTime.getMinutes();
          const timeFormat = minutes === 0 ? 'h a' : 'h:mm a';
          return {
            time: format(dateTime, timeFormat),
            actualWindSpeed: point.windSpeed,
            actualGustSpeed: point.gustSpeed,
            actualWindDirection: point.windDirection,
            actualWindDirectionText: point.windDirectionText
          };
        });
    } else {
      // EXISTING: Hourly data for standard time slots
      const standardTimeSlots = [10, 11, 12, 13, 14, 15, 16, 17];

      // Create a map of hour -> data point for quick lookup (same as wind-history)
      const hourMap = new Map(dayData.hourlyData.map(point => [point.hour, point]));

      return standardTimeSlots.map(hour => {
        const hourData = hourMap.get(hour);

        // Display at end-of-hour mark (e.g., 10:00-11:00 window shows as 11 AM)
        const displayHour = hour + 1;
        const displayTime = format(new Date().setHours(displayHour, 0, 0, 0), 'h a');

        if (hourData) {
          return {
            time: displayTime,
            actualWindSpeed: hourData.windSpeed,
            actualGustSpeed: hourData.gustSpeed,
            actualWindDirection: hourData.windDirection,
            actualWindDirectionText: hourData.windDirectionText
          };
        }

        return {
          time: displayTime,
          actualWindSpeed: null,
          actualGustSpeed: null,
          actualWindDirection: null,
          actualWindDirectionText: null
        };
      });
    }
  };

  const actualWindForDay = getActualWindForDay();
  const historicalWindForDay = getActualWindForDay(selectedHistoricalDay);

  // Get today's 6-minute granular data for Current Conditions chart
  const getTodaysGranularData = () => {
    if (!granularWindData || granularWindData.length === 0) {
      return null;
    }

    // Get today's date in Pacific timezone
    const now = new Date();
    const nowPacific = toZonedTime(now, PACIFIC_TIMEZONE);
    const todayKey = formatInTimeZone(nowPacific, PACIFIC_TIMEZONE, 'yyyy-MM-dd');

    // Find today's data
    const todayData = granularWindData.find(day => day.date === todayKey);
    if (!todayData?.hourlyData) {
      return null;
    }

    // Generate ALL possible 6-minute time slots for 24 hours (240 points total)
    const allTimeSlots = [];

    // Generate all hours from 0 (midnight) to 23 (11 PM)
    for (let hour = 0; hour <= 23; hour++) {
      const minutesInHour = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54];

      for (const minute of minutesInHour) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        const dateTime = new Date(`${todayKey}T${timeStr}`);
        const timeFormat = minute === 0 ? 'h a' : 'h:mm a';
        allTimeSlots.push({
          time: format(dateTime, timeFormat),
          hour,
          minute,
          dateTime
        });
      }
    }

    // Create a map of actual data for quick lookup (include all hours)
    const actualDataMap = new Map(
      todayData.hourlyData
        .map(point => {
          const dateTime = new Date(`${point.date}T${point.time}`);
          const key = `${dateTime.getHours()}-${dateTime.getMinutes()}`;
          return [key, point];
        })
    );

    // Fill in all time slots with actual data or null
    return allTimeSlots.map(slot => {
      const key = `${slot.hour}-${slot.minute}`;
      const actualPoint = actualDataMap.get(key);

      return {
        time: slot.time,
        windSpeed: actualPoint?.windSpeed ?? null,
        gustSpeed: actualPoint?.gustSpeed ?? null,
        windDirection: actualPoint?.windDirection ?? null,
        windDirectionText: actualPoint?.windDirectionText ?? null
      };
    });
  };

  const todaysGranularData = getTodaysGranularData();

  // Merge forecast and actual data for the chart
  const mergedChartData = (() => {
    // Always use forecast points (8 slots) as base; attach actuals by hour label
    const actualMap = new Map<string, {
      actualWindSpeed: number | null;
      actualGustSpeed: number | null;
      actualWindDirection: number | null;
      actualWindDirectionText: string | null;
    }>();

    (actualWindForDay || []).forEach(actual => {
      // Parse hour from time string (supports h a or h:mm a)
      const match = actual.time.match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)/i);
      if (!match) return;
      let hourNum = parseInt(match[1], 10);
      const ampm = match[2].toUpperCase();
      if (ampm === 'PM' && hourNum !== 12) hourNum += 12;
      if (ampm === 'AM' && hourNum === 12) hourNum = 0;

      // Use the parsed hour as the end-of-hour label (actual.time already encodes end-of-hour)
      const displayLabel = format(new Date().setHours(hourNum, 0, 0, 0), 'h a');
      actualMap.set(displayLabel, {
        actualWindSpeed: actual.actualWindSpeed,
        actualGustSpeed: actual.actualGustSpeed,
        actualWindDirection: actual.actualWindDirection ?? null,
        actualWindDirectionText: actual.actualWindDirectionText ?? null
      });
    });

    return currentForecastData.map((forecastPoint: any) => {
      const actual = actualMap.get(forecastPoint.time);
      return {
        ...forecastPoint,
        actualWindSpeed: actual?.actualWindSpeed ?? null,
        actualGustSpeed: actual?.actualGustSpeed ?? null,
        actualWindDirection: actual?.actualWindDirection ?? null,
        actualWindDirectionText: actual?.actualWindDirectionText ?? null
      };
    });
  })();

  // Linear interpolation between two values
  const lerp = (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  };

  // Convert RGB values to hex
  const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // Parse hex color to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  };

  // Get color for wind speed using smooth gradient transitions (from config)
  const getForecastWindColor = (windSpeed: number) => {
    const configStops = appConfig.colorSchemes?.windSpeed?.stops || [
      { speed: 0, color: '#3b82f6' },
      { speed: 25, color: '#8b5cf6' }
    ];

    // Convert config stops to RGB
    const colorStops = configStops.map((stop: { speed: number; color: string }) => ({
      speed: stop.speed,
      ...hexToRgb(stop.color)
    }));

    // Clamp wind speed to our range
    const maxSpeed = colorStops[colorStops.length - 1].speed;
    const clampedSpeed = Math.max(0, Math.min(maxSpeed, windSpeed));

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

  // Calculate maximum wind value across all days for consistent Y-axis scale
  const getGlobalMaxWind = (): number => {
    let globalMax = 20; // Minimum scale

    // Check LLM forecast data (days 0-4)
    if (llmForecastData) {
      llmForecastData.forEach(day => {
        day.forEach(hour => {
          if (!hour.isEmpty && hour.gustSpeed) {
            globalMax = Math.max(globalMax, hour.gustSpeed);
          }
        });
      });
    }

    // Check actual wind data (all days -3 to +4)
    if (allWindData) {
      allWindData.forEach(day => {
        day.hourlyData.forEach(hour => {
          if (hour.gustSpeed) {
            globalMax = Math.max(globalMax, hour.gustSpeed);
          }
        });
      });
    }

    // Round up to nearest 5 knots
    return Math.ceil(globalMax / 5) * 5;
  };

  // Generate Y-axis ticks based on global max (for consistent display across all days)
  const getYAxisTicks = () => {
    const domainMax = getGlobalMaxWind();
    const ticks = [];
    for (let i = 0; i <= domainMax; i += 5) {
      ticks.push(i);
    }
    return ticks;
  };

  // Custom legend renderer - simplified with just Avg Wind, Gust, Direction
  const renderCustomLegend = () => {
    return (
      <div className="flex flex-wrap justify-center items-center gap-3 text-xs">
        {/* Avg Wind */}
        <div className="flex items-center gap-1">
          <svg width="14" height="14">
            <circle cx="7" cy="7" r="6" fill="#374151" />
          </svg>
          <span style={{ color: '#374151' }}>Avg Wind</span>
        </div>
        {/* Gust */}
        <div className="flex items-center gap-1">
          <svg width="14" height="14">
            <circle cx="7" cy="7" r="6" fill="#6b7280" />
          </svg>
          <span style={{ color: '#374151' }}>Gust</span>
        </div>
        {/* Direction */}
        <div className="flex items-center gap-1">
          <svg width="18" height="18" viewBox="-10 -12 20 20">
            <polygon
              points="0,-10 -5,5 0,1.5 5,5"
              fill="#1f2937"
              stroke="white"
              strokeWidth="0.8"
            />
          </svg>
          <span style={{ color: '#374151' }}>Direction</span>
        </div>
      </div>
    );
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

    // Use average of wind speed and gust speed for color
    const avgSpeed = (payload.windSpeed + payload.gustSpeed) / 2;
    const barColor = getForecastWindColor(avgSpeed);

    return (
      <g>
        {/* Wind speed bar - color based on average of wind and gust */}
        <rect
          x={x}
          y={y + gustHeight}
          width={width}
          height={windHeight}
          fill={barColor}
        />

        {/* Additional gust - same color with lighter opacity */}
        {gustHeight > 0 && (
          <rect
            x={x}
            y={y}
            width={width}
            height={gustHeight}
            fill={barColor}
            fillOpacity="0.5"
          />
        )}

        {/* Forecast wind direction arrow - colored, closer to bar */}
        {!payload.isEmpty && payload.windDirection != null && (
          <g transform={`translate(${x + width/2}, ${y - 15})`}>
            <g transform={`rotate(${payload.windDirection + 180})`}>
              <polygon
                points="0,-10 -5,5 0,1.5 5,5"
                fill={barColor}
                stroke="white"
                strokeWidth="0.8"
              />
            </g>
          </g>
        )}

        {/* Actual wind direction arrow - black, above forecast arrow */}
        {!payload.isEmpty && payload.actualWindDirection != null && (
          <g transform={`translate(${x + width/2}, ${y - 35})`}>
            <g transform={`rotate(${payload.actualWindDirection + 180})`}>
              <polygon
                points="0,-10 -5,5 0,1.5 5,5"
                fill="#1f2937"
                stroke="white"
                strokeWidth="0.8"
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
            <p className="text-[#005F73]">Wind: {data.windSpeed.toFixed(1)} knots</p>
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
              {data.actualWindDirection !== null && (
                <p className="text-gray-600">Direction: {data.actualWindDirectionText} ({data.actualWindDirection}°)</p>
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
        <div className="bg-white rounded-lg shadow-lg px-2 py-6 mb-6">
          {/* ========== HEADER TEXT SECTION ========== */}

          {/* Title */}
          <div className="text-center mb-4">
            <h1 className="text-xl font-semibold text-gray-800">
              Cabrillo Wind Forecast
            </h1>
          </div>

          {/* Dummy Forecast Warning Banner */}
          {isDummyForecast && (
            <div className="mx-2 mb-4 bg-yellow-50 border border-yellow-300 rounded-lg p-3">
              <p className="text-sm text-yellow-800 text-center font-medium">
                ⚠️ Showing dummy forecast data (localhost testing mode)
              </p>
            </div>
          )}

          {/* Day Navigation - Mobile-First Arrow Design */}
          <div className="flex items-center justify-center gap-2 md:gap-3 mb-4">
            {/* Left Arrow */}
            <button
              onClick={() => setSelectedForecastDay(Math.max(0, selectedForecastDay - 1))}
              disabled={selectedForecastDay <= 0}
              className={`
                flex items-center justify-center
                min-w-[44px] min-h-[44px] md:min-w-[48px] md:min-h-[48px]
                rounded-lg transition-all
                ${selectedForecastDay <= 0
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  : 'bg-[#005F73] text-white hover:bg-[#0A9396] active:bg-[#005F73] shadow-sm'
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
                  : 'bg-[#005F73] text-white hover:bg-[#0A9396] active:bg-[#005F73] shadow-sm'
                }
              `}
              aria-label="Next day"
            >
              <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>

          {/* Combined Info Box - Forecast info + Station note */}
          <div className="mb-4 mx-2 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              {llmForecastMeta && (
                <>
                  Wind forecast generated {getForecastGenerationTime(llmForecastMeta.lastUpdated)} at{' '}
                  <b>{new Date(llmForecastMeta.lastUpdated).toLocaleString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'America/Los_Angeles'
                  })}</b>. Next update {getNextUpdateText(llmForecastMeta.nwsForecastTime)}.{' '}
                </>
              )}
              The wind at the spot is typically a few knots stronger than predicted; see <a href="/how-it-works"> how it works</a>.
            </p>
          </div>

          {/* Yellow Warning Box - Combined Forecast + NWS Warnings */}
          {llmForecastMeta && (llmForecastMeta.warning || (forecastData?.warnings && forecastData.warnings.length > 0)) && (
            <div className="mb-4 mx-2 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  {llmForecastMeta.warning && (
                    <p className="font-medium mb-1">{llmForecastMeta.warning.replace(/^⚠️\s*/, '')}</p>
                  )}
                  {forecastData?.warnings && forecastData.warnings.length > 0 && (
                    <ul className="list-disc list-inside space-y-1">
                      {forecastData.warnings.map((warning, index) => (
                        <li key={index}>{warning.replace(/^⚠️\s*/, '')}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}


          {(() => {
            // Scale y-axis based on this chart's data, with 25kt minimum max
            const forecastMaxWind = Math.max(
              ...mergedChartData.map((d: any) => d.windSpeed || 0),
              ...mergedChartData.map((d: any) => d.gustSpeed || 0),
              ...mergedChartData.map((d: any) => d.actualWindSpeed || 0),
              ...mergedChartData.map((d: any) => d.actualGustSpeed || 0)
            );
            const forecastYAxisMax = Math.max(
              25, // Minimum max of 25kt
              Math.ceil(forecastMaxWind / 5) * 5
            );
            const forecastYAxisTicks = [];
            for (let i = 0; i <= forecastYAxisMax; i += 5) {
              forecastYAxisTicks.push(i);
            }

            return (
          <div className="h-80 w-full relative">
            {/* Loading overlay for fresh forecast generation */}
            <ForecastLoadingOverlay isVisible={generatingFreshForecast} />

            {/* Wind in knots label overlay */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-gray-200/70 px-2 py-0.5 rounded text-xs text-gray-600">
              Wind in knots
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={mergedChartData}
                margin={{ top: 25, right: 5, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 12, fill: '#374151', textAnchor: 'middle' }}
                  axisLine={{ stroke: '#9ca3af' }}
                  tickLine={{ stroke: '#9ca3af' }}
                  interval={granularity === '6min' ? 'preserveStartEnd' : 0}
                  ticks={granularity === '6min' ? ['11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM'] : undefined}
                />
                <YAxis
                  width={35}
                  domain={[0, forecastYAxisMax]}
                  ticks={forecastYAxisTicks}
                  tick={{ fontSize: 12, fill: '#374151' }}
                  axisLine={{ stroke: '#9ca3af' }}
                  tickLine={{ stroke: '#9ca3af' }}
                />
                <Legend
                  content={renderCustomLegend}
                />
                <ReferenceLine y={10} stroke="#9ca3af" strokeDasharray="3 3" />

                {/* Actual wind data lines (same style as wind history page) */}
                <Line
                  type="monotone"
                  dataKey="actualWindSpeed"
                  stroke="#374151"
                  strokeWidth={2}
                  dot={granularity === '6min' ? false : { r: 4, fill: '#374151' }}
                  connectNulls={false}
                  name="Actual Wind"
                />
                <Line
                  type="monotone"
                  dataKey="actualGustSpeed"
                  stroke="#6b7280"
                  strokeWidth={2}
                  dot={granularity === '6min' ? false : { r: 4, fill: '#6b7280' }}
                  connectNulls={false}
                  name="Actual Gusts"
                />

                {/* Forecast bars - only show for future/present days */}
                {selectedForecastDay >= 0 && (
                  <Bar
                    dataKey="gustSpeed"
                    shape={<CustomForecastBar />}
                    fill="#3b82f6"
                    name="Forecast (bars)"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
            );
          })()}


          {/* ========== CURRENT CONDITIONS CHART ========== */}
          {todaysGranularData && todaysGranularData.length > 0 && (() => {
            // Scale y-axis based on this chart's data, with 25kt minimum max
            const todaysMaxWindSpeed = Math.max(
              ...todaysGranularData.map(d => d.windSpeed || 0),
              ...todaysGranularData.map(d => d.gustSpeed || 0)
            );
            const yAxisMax = Math.max(
              25, // Minimum max of 25kt
              Math.ceil(todaysMaxWindSpeed / 5) * 5
            );
            const yAxisTicks = [];
            for (let i = 0; i <= yAxisMax; i += 5) {
              yAxisTicks.push(i);
            }

            // Find the most recent data point with non-null wind data
            let mostRecentIndex = -1;
            for (let i = todaysGranularData.length - 1; i >= 0; i--) {
              if (todaysGranularData[i].windSpeed !== null && todaysGranularData[i].gustSpeed !== null) {
                mostRecentIndex = i;
                break;
              }
            }
            const mostRecentData = mostRecentIndex >= 0 ? todaysGranularData[mostRecentIndex] : null;

            return (
              <div className="mt-6">
                <div className="mb-4 mx-2">
                  <h2 className="text-xl font-semibold text-gray-800 text-center">
                    Today's Wind
                  </h2>
                </div>

                <div className="h-80 w-full relative">
                  {/* Wind in knots label overlay */}
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 bg-gray-200/70 px-2 py-0.5 rounded text-xs text-gray-600">
                    Wind in knots
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={todaysGranularData}
                      margin={{ top: 10, right: 5, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="time"
                        type="category"
                        tick={{ fontSize: 12, fill: '#374151', textAnchor: 'middle' }}
                        axisLine={{ stroke: '#9ca3af' }}
                        tickLine={{ stroke: '#9ca3af' }}
                        interval="preserveStartEnd"
                        ticks={['2 AM', '4 AM', '6 AM', '8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM', '10 PM']}
                      />
                      <YAxis
                        width={35}
                        domain={[0, yAxisMax]}
                        ticks={yAxisTicks}
                        tick={{ fontSize: 12, fill: '#374151' }}
                        axisLine={{ stroke: '#9ca3af' }}
                        tickLine={{ stroke: '#9ca3af' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                        formatter={(value: any, name: string | undefined) => {
                          if (value === null) return ['--', name ?? ''];
                          if (name === 'Actual Wind') return [`${value} kt`, 'Actual Wind'];
                          if (name === 'Actual Gusts') return [`${value} kt`, 'Actual Gusts'];
                          return [value, name ?? ''];
                        }}
                        cursor={{ stroke: '#9ca3af', strokeWidth: 1 }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '12px' }}
                        content={() => (
                          <div className="flex justify-center gap-4 mt-2">
                            {/* Avg Wind */}
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
                              <span className="text-xs text-gray-600">Avg Wind</span>
                            </div>
                            {/* Gust */}
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#dc2626' }} />
                              <span className="text-xs text-gray-600">Gust</span>
                            </div>
                            {/* Direction */}
                            <div className="flex items-center gap-1.5">
                              <svg width="18" height="18" viewBox="-10 -12 20 20">
                                <polygon
                                  points="0,-10 -5,5 0,1.5 5,5"
                                  fill="#1f2937"
                                  stroke="white"
                                  strokeWidth="0.8"
                                />
                              </svg>
                              <span className="text-xs text-gray-600">Direction</span>
                            </div>
                          </div>
                        )}
                      />

                      {/* Hourly grid lines for unlabeled hours */}
                      <ReferenceLine x="12 AM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="1 AM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="3 AM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="5 AM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="7 AM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="9 AM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="11 AM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="1 PM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="3 PM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="5 PM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="7 PM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="9 PM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x="11 PM" stroke="#e5e7eb" strokeDasharray="3 3" strokeOpacity={0.5} />

                      <Line
                        type="monotone"
                        dataKey="windSpeed"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={(props: any) => {
                          const { cx, cy, index, payload } = props;
                          const elements = [];

                          // Show dot only for the most recent data point
                          if (index === mostRecentIndex) {
                            elements.push(
                              <circle key="dot" cx={cx} cy={cy} r={5} fill="#10b981" stroke="#fff" strokeWidth={2} />
                            );
                          }

                          return elements.length > 0 ? <g>{elements}</g> : null;
                        }}
                        connectNulls={false}
                        name="Actual Wind"
                      />
                      <Line
                        type="monotone"
                        dataKey="gustSpeed"
                        stroke="#dc2626"
                        strokeWidth={2}
                        dot={(props: any) => {
                          const { cx, cy, index, payload } = props;
                          const elements = [];

                          // Show dot only for the most recent data point
                          if (index === mostRecentIndex) {
                            elements.push(
                              <circle key="dot" cx={cx} cy={cy} r={5} fill="#dc2626" stroke="#fff" strokeWidth={2} />
                            );
                          }

                          // Show wind direction arrow every 10th point (positioned above gust line)
                          if (index % 10 === 0 && payload.windDirection != null && payload.gustSpeed != null && cy != null) {
                            elements.push(
                              <g key="arrow" transform={`translate(${cx}, ${cy - 20})`}>
                                <g transform={`rotate(${payload.windDirection + 180})`}>
                                  <polygon
                                    points="0,-10 -5,5 0,1.5 5,5"
                                    fill="#1f2937"
                                    stroke="white"
                                    strokeWidth="0.8"
                                  />
                                </g>
                              </g>
                            );
                          }

                          return elements.length > 0 ? <g>{elements}</g> : null;
                        }}
                        connectNulls={false}
                        name="Actual Gusts"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

          {/* ========== PREVIOUS DAYS CHART ========== */}
          {historicalWindForDay && historicalWindForDay.length > 0 && (() => {
            // Scale y-axis based on this chart's data, with 25kt minimum max
            const historicalMaxWind = Math.max(
              ...historicalWindForDay.map((d: any) => d.actualWindSpeed || 0),
              ...historicalWindForDay.map((d: any) => d.actualGustSpeed || 0)
            );
            const yAxisMax = Math.max(
              25, // Minimum max of 25kt
              Math.ceil(historicalMaxWind / 5) * 5
            );
            const yAxisTicks = [];
            for (let i = 0; i <= yAxisMax; i += 5) {
              yAxisTicks.push(i);
            }

            // Add dummy bar height to create same x-axis padding as forecast chart
            const dataWithDummyBars = historicalWindForDay.map((d: any) => ({
              ...d,
              dummyBar: 0.5 // Tiny invisible bar for x-axis spacing
            }));

            return (
              <div className="mt-6">
                <div className="mb-4 mx-2">
                  <h2 className="text-xl font-semibold text-gray-800 text-center">
                    Previous Days' Wind
                  </h2>
                </div>

                {/* Day Navigation for Historical Days */}
                <div className="flex items-center justify-center gap-2 md:gap-3 mb-4">
                  {/* Left Arrow */}
                  <button
                    onClick={() => setSelectedHistoricalDay(Math.max(-3, selectedHistoricalDay - 1))}
                    disabled={selectedHistoricalDay <= -3}
                    className={`
                      flex items-center justify-center
                      min-w-[44px] min-h-[44px] md:min-w-[48px] md:min-h-[48px]
                      rounded-lg transition-all
                      ${selectedHistoricalDay <= -3
                        ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                        : 'bg-[#005F73] text-white hover:bg-[#0A9396] active:bg-[#005F73] shadow-sm'
                      }
                    `}
                    aria-label="Previous day"
                  >
                    <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
                  </button>

                  {/* Day Label */}
                  <div className="flex flex-col items-center min-w-[120px] md:min-w-[160px] text-center">
                    <div className="text-base md:text-lg font-semibold text-gray-900">
                      {getDayLabel(selectedHistoricalDay)}
                    </div>
                    <div className="text-xs md:text-sm text-gray-600">
                      {getDateLabel(selectedHistoricalDay)}
                    </div>
                  </div>

                  {/* Right Arrow */}
                  <button
                    onClick={() => setSelectedHistoricalDay(Math.min(-1, selectedHistoricalDay + 1))}
                    disabled={selectedHistoricalDay >= -1}
                    className={`
                      flex items-center justify-center
                      min-w-[44px] min-h-[44px] md:min-w-[48px] md:min-h-[48px]
                      rounded-lg transition-all
                      ${selectedHistoricalDay >= -1
                        ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                        : 'bg-[#005F73] text-white hover:bg-[#0A9396] active:bg-[#005F73] shadow-sm'
                      }
                    `}
                    aria-label="Next day"
                  >
                    <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
                  </button>
                </div>

                <div className="h-80 w-full relative">
                  {/* Wind in knots label overlay */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-gray-200/70 px-2 py-0.5 rounded text-xs text-gray-600">
                    Wind in knots
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={dataWithDummyBars}
                      margin={{ top: 25, right: 5, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="time"
                        type="category"
                        tick={{ fontSize: 12, fill: '#374151', textAnchor: 'middle' }}
                        axisLine={{ stroke: '#9ca3af' }}
                        tickLine={{ stroke: '#9ca3af' }}
                        interval={0}
                      />
                      <YAxis
                        width={35}
                        domain={[0, yAxisMax]}
                        ticks={yAxisTicks}
                        tick={{ fontSize: 12, fill: '#374151' }}
                        axisLine={{ stroke: '#9ca3af' }}
                        tickLine={{ stroke: '#9ca3af' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                        formatter={(value: any, name: string | undefined) => {
                          if (value === null) return ['--', name ?? ''];
                          return [`${value} kt`, name ?? ''];
                        }}
                        cursor={{ stroke: '#9ca3af', strokeWidth: 1 }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '12px' }}
                        content={() => (
                          <div className="flex justify-center gap-4 mt-2">
                            {/* Avg Wind */}
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#374151' }} />
                              <span className="text-xs text-gray-600">Avg Wind</span>
                            </div>
                            {/* Gust */}
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#6b7280' }} />
                              <span className="text-xs text-gray-600">Gust</span>
                            </div>
                            {/* Direction */}
                            <div className="flex items-center gap-1.5">
                              <svg width="18" height="18" viewBox="-10 -12 20 20">
                                <polygon
                                  points="0,-10 -5,5 0,1.5 5,5"
                                  fill="#1f2937"
                                  stroke="white"
                                  strokeWidth="0.8"
                                />
                              </svg>
                              <span className="text-xs text-gray-600">Direction</span>
                            </div>
                          </div>
                        )}
                      />
                      <ReferenceLine y={10} stroke="#9ca3af" strokeDasharray="3 3" />

                      {/* Invisible dummy bar to create same x-axis padding as forecast chart */}
                      <Bar
                        dataKey="dummyBar"
                        fill="transparent"
                        barSize={40}
                      />

                      <Line
                        type="monotone"
                        dataKey="actualWindSpeed"
                        stroke="#374151"
                        strokeWidth={2}
                        dot={(props: any) => {
                          const { cx, cy, payload } = props;
                          // Standard dot only
                          return <circle cx={cx} cy={cy} r={4} fill="#374151" />;
                        }}
                        connectNulls={false}
                        name="Actual Wind"
                      />
                      <Line
                        type="monotone"
                        dataKey="actualGustSpeed"
                        stroke="#6b7280"
                        strokeWidth={2}
                        dot={(props: any) => {
                          const { cx, cy, payload } = props;
                          const elements = [];

                          // Standard dot
                          elements.push(
                            <circle key="dot" cx={cx} cy={cy} r={4} fill="#6b7280" />
                          );

                          // Wind direction arrow (positioned above gust line)
                          if (payload.actualWindDirection != null && payload.actualGustSpeed != null && cy != null) {
                            elements.push(
                              <g key="arrow" transform={`translate(${cx}, ${cy - 20})`}>
                                <g transform={`rotate(${payload.actualWindDirection + 180})`}>
                                  <polygon
                                    points="0,-10 -5,5 0,1.5 5,5"
                                    fill="#1f2937"
                                    stroke="white"
                                    strokeWidth="0.8"
                                  />
                                </g>
                              </g>
                            );
                          }

                          return <g>{elements}</g>;
                        }}
                        connectNulls={false}
                        name="Actual Gusts"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

        </div>

        {/* ========================================
            CONSOLIDATED DEBUG SECTION
            ======================================== */}
        {((isLocalhost && (appConfig.debug as any).showDebugSectionLocalhost) ||
          (!isLocalhost && (appConfig.debug as any).showDebugSectionProduction)) && (
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
                {appConfig.llmForecast.enabled && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchLlmForecast(true);
                    }}
                    disabled={llmForecastLoading}
                    className="flex items-center space-x-2 text-sm bg-[#005F73] text-white px-3 py-1.5 rounded hover:bg-[#0A9396] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
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
                )}

                {/* Manual store wind actuals */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerStoreWindActuals();
                  }}
                  disabled={storeWindLoading}
                  className="flex items-center space-x-2 text-sm bg-gray-700 text-white px-3 py-1.5 rounded hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {storeWindLoading ? (
                    <>
                      <div className="w-3 h-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      <span>Storing wind data...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v4H4zM4 12h8v8H4z" />
                      </svg>
                      <span>Store Wind Actuals</span>
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
                  <span className="w-6 h-6 bg-[#E0F2F1] text-[#005F73] rounded-full flex items-center justify-center text-xs font-bold mr-2">1</span>
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
                  <span className="w-6 h-6 bg-[#E0F2F1] text-[#005F73] rounded-full flex items-center justify-center text-xs font-bold mr-2">2</span>
                  Wind Data Debug
                </h4>
                <div className="space-y-2 text-sm font-mono">
                  <div className="flex">
                    <span className="text-gray-600 w-48">Data Loaded:</span>
                    <span className="text-gray-900 font-semibold">{allWindData ? 'Yes' : 'No'}</span>
                  </div>
                  {storeWindMessage && (
                    <div className="p-2 bg-gray-100 border border-gray-200 rounded text-gray-800">
                      {storeWindMessage}
                    </div>
                  )}
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

              {/* 4. Area Forecast - Inner Waters */}
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setShowAreaForecast(!showAreaForecast)}
                >
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center">
                    <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold mr-2">4</span>
                    Area Forecast - Inner Waters
                  </h4>
                  {showAreaForecast ? (
                    <ChevronUp className="w-4 h-4 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                  )}
                </div>
                {showAreaForecast && (
                  <div className="mt-3 space-y-3">
                    {forecastError ? (
                      <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        Unable to load area forecast.{' '}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchForecastData();
                          }}
                          className="underline font-semibold"
                        >
                          Retry
                        </button>
                      </div>
                    ) : forecastLoading && !forecastData ? (
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
                        <span>Loading forecast...</span>
                      </div>
                    ) : forecastData ? (
                      <div className="p-3 bg-gray-900 text-purple-300 rounded font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                        {forecastData.original}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">No forecast available.</div>
                    )}
                  </div>
                )}
              </div>

              {/* 5. Processed Forecast - Collapsible */}
              {forecastData?.processed && (
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setShowProcessedForecast(!showProcessedForecast)}
                  >
                    <h4 className="text-sm font-semibold text-gray-900 flex items-center">
                      <span className="w-6 h-6 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center text-xs font-bold mr-2">5</span>
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

              {/* 6. LLM Prompt - Collapsible */}
              {llmPrompt && (
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setShowLlmPrompt(!showLlmPrompt)}
                  >
                    <h4 className="text-sm font-semibold text-gray-900 flex items-center">
                      <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-bold mr-2">6</span>
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
        )}

        </div>
      </div>
    </div>
  );
}
