'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, RefreshCw } from 'lucide-react';
import Navigation from '../../components/Navigation';
import ArchitectureDiagram from '@/components/diagrams/ArchitectureDiagram';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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

interface SausageModeData {
  success: boolean;
  data: {
    nwsData: {
      url: string;
      fetchedAt: string;
      issuedTime: string | null;
      forecastUrl: string | null;
      rawForecastLength: number;
    };
    extractedForecast: {
      innerWatersForecast: string | null;
      extractedLength: number;
      extractionMethod: string;
      parsedPeriods: number;
      warnings: string[];
      dayForecasts: Array<{ day: number; text: string }>;
    };
    trainingData: {
      filePath: string;
      month: string;
      forecastNumber: number;
      totalExamples: number;
      examplesUsed: number;
      format: string;
    };
    prompt: {
      fullPrompt: string;
      promptLength: number;
      promptTokenEstimate: number;
      requestedDays: number;
      includesWarnings: boolean;
    };
    llmConfig: {
      model: string;
      max_tokens: number;
      currentTime: string;
      timezone: string;
      apiKeySet: boolean;
    };
  };
}

interface ForecastData {
  success: boolean;
  data: {
    predictions: any[][];
    isLLMGenerated: boolean;
    lastUpdated: string;
    nwsForecastTime: string;
    source: string;
  };
}

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
  badgeColor?: string;
}

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

function CollapsibleSection({ title, children, defaultOpen = false, badge, badgeColor = 'bg-blue-100 text-blue-800' }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg mb-4 bg-white shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {badge && (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
      </button>
      {isOpen && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          {children}
        </div>
      )}
    </div>
  );
}

function DataRow({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) {
  const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return (
    <div className="flex py-2 border-b border-gray-200 last:border-0">
      <div className="w-1/3 font-medium text-gray-700">{label}</div>
      <div className={`w-2/3 text-gray-900 ${mono ? 'font-mono text-sm' : ''} break-words`}>
        {displayValue}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DebugPage() {
  // Debug Console State
  const [windData, setWindData] = useState<WindData | null>(null);
  const [windDataAge, setWindDataAge] = useState<DataAge | null>(null);
  const [noaaData, setNoaaData] = useState<NoaaWindData | null>(null);
  const [noaaDataAge, setNoaaDataAge] = useState<DataAge | null>(null);
  const [loading, setLoading] = useState(true);
  const [noaaLoading, setNoaaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noaaError, setNoaaError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [noaaDebugInfo, setNoaaDebugInfo] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [lastNoaaUpdate, setLastNoaaUpdate] = useState<string>('');
  const [showDebug, setShowDebug] = useState(false);
  const [showNoaaDebug, setShowNoaaDebug] = useState(false);

  // Sausage Mode State
  const [diagnosticData, setDiagnosticData] = useState<SausageModeData | null>(null);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [sausageLoading, setSausageLoading] = useState(true);
  const [sausageError, setSausageError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Debug Console Functions
  const fetchWindData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/wind-data');
      const data: WindApiResponse = await response.json();

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

  const fetchNoaaData = async () => {
    try {
      setNoaaLoading(true);
      const response = await fetch('/api/noaa-observations');
      const data: NoaaApiResponse = await response.json();

      setNoaaDebugInfo(data.debug || null);

      if (data.success && data.data) {
        setNoaaData(data.data);
        setNoaaDataAge(data.dataAge || null);
        setLastNoaaUpdate(new Date().toLocaleTimeString());
        setNoaaError(null);
      } else {
        setNoaaError(data.message || 'Failed to fetch NOAA observations');
        console.error('NOAA API Error:', data);
      }
    } catch (err) {
      setNoaaError('Network error');
      console.error('NOAA Fetch Error:', err);
    } finally {
      setNoaaLoading(false);
    }
  };

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

    if (noaaDataAge) {
      const originalTimestamp = new Date(noaaDataAge.timestamp.replace(' PST', ''));
      const updatedMinutes = Math.floor((now.getTime() - originalTimestamp.getTime()) / (1000 * 60));
      setNoaaDataAge({
        ...noaaDataAge,
        minutes: updatedMinutes,
        isOld: updatedMinutes > 12,
        warning: updatedMinutes > 12 ? `WARNING: Latest station reading ${updatedMinutes} min ago` : null
      });
    }
  };

  // Sausage Mode Functions
  const fetchSausageData = async () => {
    setSausageLoading(true);
    setSausageError(null);
    try {
      const [diagnosticRes, forecastRes] = await Promise.all([
        fetch('/api/sausage-mode'),
        fetch('/api/llm-forecast')
      ]);

      if (!diagnosticRes.ok || !forecastRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const diagnostic = await diagnosticRes.json();
      const forecast = await forecastRes.json();

      setDiagnosticData(diagnostic);
      setForecastData(forecast);
      setLastRefresh(new Date());
    } catch (err) {
      setSausageError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSausageLoading(false);
    }
  };

  const downloadJSON = () => {
    const fullData = {
      diagnosticData,
      forecastData,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-diagnostics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Initial Data Fetch
  useEffect(() => {
    fetchWindData();
    fetchNoaaData();
    fetchSausageData();

    const windInterval = setInterval(fetchWindData, 5 * 60 * 1000);
    const noaaInterval = setInterval(fetchNoaaData, 5 * 60 * 1000);
    const ageUpdateInterval = setInterval(updateDataAges, 60 * 1000);

    return () => {
      clearInterval(windInterval);
      clearInterval(noaaInterval);
      clearInterval(ageUpdateInterval);
    };
  }, []);

  const getWindDirectionText = (degrees: number) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  };

  const getWindSpeedCategory = (speed: number) => {
    if (speed < 7) return { category: 'Light', color: 'text-green-600' };
    if (speed < 14) return { category: 'Moderate', color: 'text-[#005F73]' };
    if (speed < 21) return { category: 'Fresh', color: 'text-orange-600' };
    if (speed < 28) return { category: 'Strong', color: 'text-red-600' };
    return { category: 'Gale', color: 'text-[#005F73]' };
  };

  const getCacheStatusColor = (source: string) => {
    if (source === 'fresh_llm') return 'bg-green-100 text-green-800';
    if (source === 'cache') return 'bg-blue-100 text-blue-800';
    if (source === 'cache_same_forecast') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getCacheStatusLabel = (source: string) => {
    if (source === 'fresh_llm') return 'Fresh LLM Generation';
    if (source === 'cache') return 'Cached (Time-based)';
    if (source === 'cache_same_forecast') return 'Cached (NWS Unchanged)';
    if (source === 'cache_fallback') return 'Cache Fallback';
    return source;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Debug & Diagnostics</h1>
              <p className="text-gray-600 mt-1">Technical information, API diagnostics, and complete system transparency</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  fetchWindData();
                  fetchNoaaData();
                  fetchSausageData();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#005F73] text-white rounded-lg hover:bg-[#0A9396] transition-colors"
              >
                <RefreshCw size={16} />
                Refresh All
              </button>
              <button
                onClick={downloadJSON}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Download size={16} />
                Export JSON
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            Last refreshed: {lastRefresh.toLocaleString()}
          </div>
        </div>

        {/* ====================================================================== */}
        {/* SECTION 1: DEBUG CONSOLE - API DATA SOURCES */}
        {/* ====================================================================== */}

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">API Data Sources</h2>

          {/* Wind Data Debug Section */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">AGXC1 Station Data</h3>
                <p className="text-xs text-gray-600">Raw station measurements • Updated: {lastUpdate}</p>
              </div>
              <button
                onClick={fetchWindData}
                disabled={loading}
                className="bg-[#005F73] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#0A9396] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {/* Data Age Warning */}
            {windDataAge?.isOld && (
              <div className="mb-4 px-3 py-2 bg-yellow-100 border border-yellow-300 rounded-lg">
                <p className="text-sm text-yellow-800 font-medium">
                  ⚠️ {windDataAge.warning}
                </p>
              </div>
            )}

            {error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-red-700 font-medium mb-2">Station Data Error</div>
                <p className="text-red-600 text-sm mb-3">{error}</p>

                {debugInfo && (
                  <div className="mb-3">
                    <button
                      onClick={() => setShowDebug(!showDebug)}
                      className="text-xs text-red-600 hover:text-red-800 underline"
                    >
                      {showDebug ? 'Hide' : 'Show'} Debug Info
                    </button>

                    {showDebug && (
                      <div className="bg-gray-100 p-3 rounded mt-2 text-xs overflow-auto max-h-48">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(debugInfo, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => window.open('/api/wind-data', '_blank')}
                  className="bg-red-600 text-white px-4 py-2 rounded text-xs hover:bg-red-700"
                >
                  Test API
                </button>
              </div>
            ) : loading && !windData ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#005F73] mx-auto"></div>
                <p className="text-gray-600 mt-3">Loading station data...</p>
              </div>
            ) : windData ? (
              <div className="space-y-4">
                {/* Raw Data Display */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-800">
                      {windData.windSpeed.toFixed(1)}
                      <span className="text-sm text-gray-600 ml-1">kt</span>
                    </div>
                    <div className="text-xs text-gray-600">Wind Speed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-800">
                      {windData.gustSpeed.toFixed(1)}
                      <span className="text-sm text-gray-600 ml-1">kt</span>
                    </div>
                    <div className="text-xs text-gray-600">Gust Speed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-800">
                      {getWindDirectionText(windData.windDirection)}
                    </div>
                    <div className="text-xs text-gray-600">{windData.windDirection}°</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-800">
                      {windData.pressure > 0 ? windData.pressure.toFixed(0) : 'N/A'}
                      {windData.pressure > 0 && <span className="text-sm text-gray-600 ml-1">mb</span>}
                    </div>
                    <div className="text-xs text-gray-600">Pressure</div>
                  </div>
                </div>

                {/* Technical Details */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-2">Technical Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div><span className="font-medium">Station Time:</span> {windData.datetime}</div>
                    <div><span className="font-medium">Air Temp:</span> {windData.airTemp > 0 ? `${windData.airTemp.toFixed(1)}°F` : 'N/A'}</div>
                    <div><span className="font-medium">Water Temp:</span> {windData.waterTemp > 0 ? `${windData.waterTemp.toFixed(1)}°F` : 'N/A'}</div>
                    <div><span className="font-medium">Data Age:</span> {windDataAge?.minutes || 0} minutes</div>
                  </div>
                </div>

                {/* Debug Info Toggle */}
                {debugInfo && (
                  <div>
                    <button
                      onClick={() => setShowDebug(!showDebug)}
                      className="text-sm text-[#005F73] hover:text-[#0A9396] underline mb-2"
                    >
                      {showDebug ? 'Hide' : 'Show'} Raw Debug Data
                    </button>

                    {showDebug && (
                      <div className="bg-gray-100 p-4 rounded-lg text-xs overflow-auto max-h-64">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(debugInfo, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* NOAA API Debug Section */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-l-4 border-[#005F73]">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">NOAA API Observations</h3>
                <p className="text-xs text-gray-600">JSON API • api.weather.gov • Updated: {lastNoaaUpdate}</p>
              </div>
              <button
                onClick={fetchNoaaData}
                disabled={noaaLoading}
                className="bg-[#005F73] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#0A9396] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {noaaLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {/* NOAA Data Age Warning */}
            {noaaDataAge?.isOld && (
              <div className="mb-4 px-3 py-2 bg-yellow-100 border border-yellow-300 rounded-lg">
                <p className="text-sm text-yellow-800 font-medium">
                  ⚠️ {noaaDataAge.warning}
                </p>
              </div>
            )}

            {noaaError ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-red-700 font-medium mb-2">NOAA API Error</div>
                <p className="text-red-600 text-sm mb-3">{noaaError}</p>

                {noaaDebugInfo && (
                  <div className="mb-3">
                    <button
                      onClick={() => setShowNoaaDebug(!showNoaaDebug)}
                      className="text-xs text-red-600 hover:text-red-800 underline"
                    >
                      {showNoaaDebug ? 'Hide' : 'Show'} Debug Info
                    </button>

                    {showNoaaDebug && (
                      <div className="bg-gray-100 p-3 rounded mt-2 text-xs overflow-auto max-h-48">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(noaaDebugInfo, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => window.open('/api/noaa-observations', '_blank')}
                  className="bg-red-600 text-white px-4 py-2 rounded text-xs hover:bg-red-700"
                >
                  Test NOAA API
                </button>
              </div>
            ) : noaaLoading && !noaaData ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#005F73] mx-auto"></div>
                <p className="text-gray-600 mt-3">Loading NOAA data...</p>
              </div>
            ) : noaaData ? (
              <div className="space-y-4">
                {/* NOAA Raw Data Display */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-800">
                      {noaaData.windSpeed.toFixed(1)}
                      <span className="text-sm text-gray-600 ml-1">{noaaData.windSpeedUnit}</span>
                    </div>
                    <div className="text-xs text-gray-600">Wind Speed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-800">
                      {noaaData.windGust !== null ? (
                        <>
                          {noaaData.windGust.toFixed(1)}
                          <span className="text-sm text-gray-600 ml-1">{noaaData.windGustUnit}</span>
                        </>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600">Gust Speed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-800">
                      {getWindDirectionText(noaaData.windDirection)}
                    </div>
                    <div className="text-xs text-gray-600">{noaaData.windDirection}°</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-lg font-semibold ${getWindSpeedCategory(noaaData.windSpeed).color}`}>
                      {getWindSpeedCategory(noaaData.windSpeed).category}
                    </div>
                    <div className="text-xs text-gray-600">Category</div>
                  </div>
                </div>

                {/* NOAA Technical Details */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-2">NOAA API Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div><span className="font-medium">Observation Time:</span> {noaaData.timestamp}</div>
                    <div><span className="font-medium">Data Age:</span> {noaaDataAge?.minutes || 0} minutes</div>
                    <div><span className="font-medium">Wind Unit:</span> {noaaData.windSpeedUnit}</div>
                    <div><span className="font-medium">Gust Unit:</span> {noaaData.windGustUnit || 'N/A'}</div>
                  </div>
                </div>

                {/* NOAA Debug Info Toggle */}
                {noaaDebugInfo && (
                  <div>
                    <button
                      onClick={() => setShowNoaaDebug(!showNoaaDebug)}
                      className="text-sm text-[#005F73] hover:text-[#0A9396] underline mb-2"
                    >
                      {showNoaaDebug ? 'Hide' : 'Show'} NOAA API Debug Data
                    </button>

                    {showNoaaDebug && (
                      <div className="bg-gray-100 p-4 rounded-lg text-xs overflow-auto max-h-64">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(noaaDebugInfo, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* API Endpoints Reference */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">API Reference</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="font-mono text-gray-700">/api/wind-data</span>
                <button
                  onClick={() => window.open('/api/wind-data', '_blank')}
                  className="bg-gray-100 text-gray-700 px-3 py-1 rounded hover:bg-gray-200"
                >
                  Test
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-gray-700">/api/noaa-observations</span>
                <button
                  onClick={() => window.open('/api/noaa-observations', '_blank')}
                  className="bg-gray-100 text-gray-700 px-3 py-1 rounded hover:bg-gray-200"
                >
                  Test
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-gray-700">/api/area-forecast</span>
                <button
                  onClick={() => window.open('/api/area-forecast', '_blank')}
                  className="bg-gray-100 text-gray-700 px-3 py-1 rounded hover:bg-gray-200"
                >
                  Test
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-gray-700">/api/five-day-wind</span>
                <button
                  onClick={() => window.open('/api/five-day-wind', '_blank')}
                  className="bg-gray-100 text-gray-700 px-3 py-1 rounded hover:bg-gray-200"
                >
                  Test
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ====================================================================== */}
        {/* SECTION 2: SAUSAGE MODE - COMPLETE PIPELINE TRANSPARENCY */}
        {/* ====================================================================== */}

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Complete Pipeline Transparency</h2>
          <p className="text-gray-600 mb-6">
            Every step from NWS forecast to wind predictions - nothing hidden, nothing summarized.
          </p>

          {/* Architecture Deep Dive */}
          <CollapsibleSection
            title="System Architecture Deep Dive"
            defaultOpen={false}
            badge="Technical Overview"
            badgeColor="bg-purple-100 text-purple-800"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-700 mb-4">
                This diagram shows the complete technical architecture of the wind forecasting system,
                from frontend pages through API routes, caching layers, and external data sources.
              </p>
              <ArchitectureDiagram />

              {/* Technical Details */}
              <div className="mt-6 bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Key Architectural Decisions</h4>
                <div className="space-y-3 text-sm text-gray-700">
                  <div>
                    <strong className="text-gray-900">Serverless Deployment (Vercel):</strong>
                    <p className="ml-4 mt-1">Read-only filesystem except /tmp. All config and training data bundled in web-ui/ directory. Environment-aware caching strategy adapts to serverless constraints.</p>
                  </div>
                  <div>
                    <strong className="text-gray-900">Multi-Layer Caching:</strong>
                    <p className="ml-4 mt-1">Time-based (3hr TTL), content-based (NWS unchanged detection), and HTTP ETag support combine for optimal performance without staleness.</p>
                  </div>
                  <div>
                    <strong className="text-gray-900">API Consolidation:</strong>
                    <p className="ml-4 mt-1">Unified /api/wind-history endpoint replaces duplicate five-day-wind and station-history endpoints (refactoring in progress).</p>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Data Processing Pipeline */}
          <CollapsibleSection
            title="Data Processing Pipeline"
            defaultOpen={false}
            badge="Offline Processing"
            badgeColor="bg-green-100 text-green-800"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-700 mb-4">
                Before real-time forecasting begins, historical data goes through an extensive offline processing pipeline
                to create high-quality training examples.
              </p>

              {/* Pipeline Visualization */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-6 border border-gray-300">
                <div className="space-y-6">
                  {/* Step 1 */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      1
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">Raw NOAA Buoy Data (2016-2024)</div>
                      <div className="text-xs text-gray-600">6-minute measurements in GMT, ~150KB per year</div>
                    </div>
                  </div>
                  <div className="ml-4 border-l-2 border-gray-300 h-6"></div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      2
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">scripts/processing/process_wind_data.py</div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>• GMT → PST timezone conversion (DST-aware)</div>
                        <div>• Filter to 10 AM - 7 PM window</div>
                        <div>• Hourly aggregation (avg for WSPD, max for GST)</div>
                        <div>• Remove invalid sentinel values (99.0, 999.0)</div>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 border-l-2 border-gray-300 h-6"></div>

                  {/* Step 3 */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      3
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">Cleaned Wind Data</div>
                      <div className="text-xs text-gray-600">2,690 complete days / 2,872 total (93.7% completeness)</div>
                    </div>
                  </div>
                  <div className="ml-4 border-l-2 border-gray-300 h-6"></div>

                  {/* Step 4 */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-yellow-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      4
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">scripts/training/generate_training_data.py</div>
                      <div className="text-xs text-gray-600">Combine forecasts with actual wind measurements</div>
                    </div>
                  </div>
                  <div className="ml-4 border-l-2 border-gray-300 h-6"></div>

                  {/* Step 5 */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      5
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">8,538 Training Examples (51 MB JSON)</div>
                      <div className="text-xs text-gray-600">Complete forecast-actual pairs</div>
                    </div>
                  </div>
                  <div className="ml-4 border-l-2 border-gray-300 h-6"></div>

                  {/* Step 6 */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      6
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">scripts/training/curate_few_shot_examples.py</div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>• Select 15 examples per month/forecast combination</div>
                        <div>• Wind strength distribution: 4 calm, 8 moderate, 3 strong</div>
                        <div>• Ensure temporal diversity across years</div>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 border-l-2 border-gray-300 h-6"></div>

                  {/* Step 7 */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-[#005F73] text-white rounded-full flex items-center justify-center font-bold text-sm">
                      7
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">720 Curated Examples (48 files)</div>
                      <div className="text-xs text-gray-600">12 months × 4 forecast numbers × 15 examples = 720 total</div>
                    </div>
                  </div>
                  <div className="ml-4 border-l-2 border-gray-300 h-6"></div>

                  {/* Final Step */}
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-gray-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      ✓
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">Used in LLM Prompts</div>
                      <div className="text-xs text-gray-600">Loaded dynamically based on current month and time</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Processing Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <div className="text-2xl font-bold text-blue-900">25,288</div>
                  <div className="text-xs text-blue-700">Validated hourly measurements</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <div className="text-2xl font-bold text-green-900">93.7%</div>
                  <div className="text-xs text-green-700">Data completeness rate</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                  <div className="text-2xl font-bold text-purple-900">9</div>
                  <div className="text-xs text-purple-700">Years of historical data</div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Current Forecast Status */}
          {forecastData?.data && (
            <CollapsibleSection
              title="Current Forecast Status"
              defaultOpen={true}
              badge={getCacheStatusLabel(forecastData.data.source)}
              badgeColor={getCacheStatusColor(forecastData.data.source)}
            >
              <div className="space-y-2">
                <DataRow label="LLM Generated" value={forecastData.data.isLLMGenerated ? 'Yes' : 'No'} />
                <DataRow label="Last Updated" value={new Date(forecastData.data.lastUpdated).toLocaleString()} />
                <DataRow label="NWS Forecast Time" value={new Date(forecastData.data.nwsForecastTime).toLocaleString()} />
                <DataRow label="Source" value={forecastData.data.source} />
                <DataRow label="Days Forecasted" value={forecastData.data.predictions?.length || 0} />
                <DataRow
                  label="Hours per Day"
                  value={forecastData.data.predictions?.[0]?.length || 0}
                />
              </div>
            </CollapsibleSection>
          )}

          {/* NWS Data Source */}
          {diagnosticData?.data?.nwsData && (
            <CollapsibleSection title="NWS Data Source" defaultOpen={false}>
              <div className="space-y-2">
                <DataRow label="API Endpoint" value={diagnosticData.data.nwsData.url} mono />
                <DataRow label="Fetched At" value={new Date(diagnosticData.data.nwsData.fetchedAt).toLocaleString()} />
                <DataRow
                  label="Issued Time"
                  value={diagnosticData.data.nwsData.issuedTime
                    ? new Date(diagnosticData.data.nwsData.issuedTime).toLocaleString()
                    : 'Unknown'}
                />
                <DataRow
                  label="Forecast URL"
                  value={diagnosticData.data.nwsData.forecastUrl || 'N/A'}
                  mono
                />
                <DataRow
                  label="Raw Forecast Size"
                  value={`${(diagnosticData.data.nwsData.rawForecastLength / 1024).toFixed(1)} KB`}
                />
              </div>
            </CollapsibleSection>
          )}

          {/* Extracted Forecast */}
          {diagnosticData?.data?.extractedForecast && (
            <CollapsibleSection
              title="Extracted & Parsed Forecast"
              badge={`${diagnosticData.data.extractedForecast.parsedPeriods} periods`}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <DataRow label="Extraction Method" value={diagnosticData.data.extractedForecast.extractionMethod} />
                  <DataRow
                    label="Extracted Size"
                    value={`${(diagnosticData.data.extractedForecast.extractedLength / 1024).toFixed(1)} KB`}
                  />
                  <DataRow label="Parsed Periods" value={diagnosticData.data.extractedForecast.parsedPeriods} />
                  <DataRow
                    label="Warnings"
                    value={diagnosticData.data.extractedForecast.warnings.length > 0
                      ? diagnosticData.data.extractedForecast.warnings.join(', ')
                      : 'None'}
                  />
                </div>

                {/* Day Forecasts */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Parsed Day Forecasts:</h3>
                  <div className="space-y-2">
                    {diagnosticData.data.extractedForecast.dayForecasts.map((dayForecast) => (
                      <div key={dayForecast.day} className="bg-white rounded p-3 border border-gray-200">
                        <div className="font-medium text-gray-700 mb-1">Day {dayForecast.day}</div>
                        <div className="text-sm text-gray-600 font-mono whitespace-pre-wrap">
                          {dayForecast.text || '(empty)'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Raw Inner Waters Forecast */}
                {diagnosticData.data.extractedForecast.innerWatersForecast && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Raw Inner Waters Forecast:</h3>
                    <pre className="bg-white rounded p-3 border border-gray-200 text-xs overflow-x-auto max-h-96 overflow-y-auto">
                      {diagnosticData.data.extractedForecast.innerWatersForecast}
                    </pre>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Training Data */}
          {diagnosticData?.data?.trainingData && (
            <CollapsibleSection
              title="Training Examples Details"
              badge={`${diagnosticData.data.trainingData.examplesUsed} examples loaded`}
              badgeColor="bg-orange-100 text-orange-800"
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DataRow label="File Path" value={diagnosticData.data.trainingData.filePath} mono />
                  <DataRow label="Month" value={diagnosticData.data.trainingData.month.toUpperCase()} />
                  <DataRow label="Forecast Number" value={diagnosticData.data.trainingData.forecastNumber} />
                  <DataRow label="Total Examples" value={diagnosticData.data.trainingData.totalExamples} />
                  <DataRow label="Examples Used" value={diagnosticData.data.trainingData.examplesUsed} />
                  <DataRow label="Format" value={diagnosticData.data.trainingData.format} />
                </div>

                {/* 48-File Organization */}
                <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="font-semibold text-gray-900 mb-3">48-File Organization Structure</h4>
                  <div className="text-sm text-gray-700 space-y-2">
                    <p>Training examples are organized into 48 files: <strong>12 months × 4 forecast numbers = 48 total</strong></p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div className="bg-white p-3 rounded border border-gray-300">
                        <div className="text-xs font-semibold text-gray-700 mb-2">Forecast Time Classification:</div>
                        <div className="space-y-1 text-xs">
                          <div>• <strong>FC1 (6 AM - 2 PM):</strong> Morning forecasts</div>
                          <div>• <strong>FC2 (2 PM - 8 PM):</strong> Afternoon forecasts</div>
                          <div>• <strong>FC3 (8 PM+):</strong> Evening forecasts</div>
                          <div>• <strong>FC4:</strong> Additional daily forecast</div>
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded border border-gray-300">
                        <div className="text-xs font-semibold text-gray-700 mb-2">Example Files:</div>
                        <div className="space-y-1 text-xs font-mono">
                          <div>jan_fc1_examples.json</div>
                          <div>jul_fc2_examples.json</div>
                          <div>dec_fc3_examples.json</div>
                          <div className="text-gray-500">... 45 more files</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Wind Strength Distribution */}
                <div className="mt-4 bg-yellow-50 rounded-lg p-4 border border-yellow-300">
                  <h4 className="font-semibold text-yellow-900 mb-3">Wind Strength Distribution (per file)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-white p-3 rounded border border-yellow-400">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">4</div>
                        <div className="text-xs text-gray-600">Calm Examples</div>
                        <div className="text-xs text-gray-500 mt-1">&lt; 10 kt peak WSPD</div>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded border border-yellow-400">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">8</div>
                        <div className="text-xs text-gray-600">Moderate Examples</div>
                        <div className="text-xs text-gray-500 mt-1">10-20 kt peak WSPD</div>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded border border-yellow-400">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">3</div>
                        <div className="text-xs text-gray-600">Strong Examples</div>
                        <div className="text-xs text-gray-500 mt-1">&gt; 20 kt peak WSPD</div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-yellow-800 mt-3">
                    This distribution ensures the LLM learns from diverse wind conditions, not just average days.
                    Each file is curated to maintain this balance.
                  </p>
                </div>

                {/* Year Diversity */}
                <div className="mt-4 bg-green-50 rounded-lg p-4 border border-green-200">
                  <h4 className="font-semibold text-green-900 mb-2">Temporal Diversity</h4>
                  <p className="text-xs text-green-800">
                    Examples within each file span multiple years (2016-2024) to capture inter-annual variability
                    and prevent temporal bias. This ensures the model learns robust patterns, not year-specific anomalies.
                  </p>
                </div>

                {/* Total Stats */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
                    <div className="text-2xl font-bold text-blue-900">720</div>
                    <div className="text-xs text-blue-700">Total Curated Examples</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 border border-purple-200 text-center">
                    <div className="text-2xl font-bold text-purple-900">48</div>
                    <div className="text-xs text-purple-700">Scenario Files (month × FC)</div>
                  </div>
                  <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200 text-center">
                    <div className="text-2xl font-bold text-indigo-900">15</div>
                    <div className="text-xs text-indigo-700">Examples per File</div>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* LLM Configuration */}
          {diagnosticData?.data?.llmConfig && (
            <CollapsibleSection
              title="LLM Configuration Explained"
              badge="Model Parameters"
              badgeColor="bg-indigo-100 text-indigo-800"
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DataRow label="Model" value={diagnosticData.data.llmConfig.model} mono />
                  <DataRow label="Max Tokens" value={diagnosticData.data.llmConfig.max_tokens} />
                  <DataRow label="Timezone" value={diagnosticData.data.llmConfig.timezone} />
                  <DataRow label="API Key Set" value={diagnosticData.data.llmConfig.apiKeySet ? 'Yes' : 'No'} />
                  <DataRow
                    label="Current Time"
                    value={new Date(diagnosticData.data.llmConfig.currentTime).toLocaleString()}
                  />
                </div>

                {/* Parameter Explanations */}
                <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h4 className="font-semibold text-gray-900 mb-3">Model Parameter Details</h4>
                  <div className="space-y-3 text-sm text-gray-700">
                    <div>
                      <strong className="text-gray-900">Model: </strong>
                      <code className="text-xs bg-gray-200 px-2 py-1 rounded">claude-sonnet-4-20250514</code>
                      <p className="ml-4 mt-1 text-xs">Claude Sonnet 4 from Anthropic. Balanced performance and cost for few-shot learning tasks.</p>
                    </div>
                    <div>
                      <strong className="text-gray-900">Temperature: 1.0</strong>
                      <p className="ml-4 mt-1 text-xs">Maximum diversity setting allows natural variance expression. At 1.0, the model can express forecast uncertainty naturally, resulting in ±1.54kt WSPD and ±2.02kt GST error variance.</p>
                      <p className="ml-4 mt-1 text-xs italic text-gray-600">Alternative: Temperature 0.0 would reduce variance by 80-90% for deterministic predictions.</p>
                    </div>
                    <div>
                      <strong className="text-gray-900">Top-p: 1.0</strong>
                      <p className="ml-4 mt-1 text-xs">Nucleus sampling disabled (considers all tokens). Combined with temperature 1.0 for maximum model expressiveness.</p>
                    </div>
                    <div>
                      <strong className="text-gray-900">Max Tokens: {diagnosticData.data.llmConfig.max_tokens}</strong>
                      <p className="ml-4 mt-1 text-xs">Forecast responses: 2500 tokens (5-day predictions). Validation responses: 2000 tokens (single-day tests).</p>
                    </div>
                  </div>
                </div>

                {/* Variance Testing Results */}
                <div className="mt-4 bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-2">Variance Testing Results (Temperature 1.0)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-blue-700">WSPD Error (Wind Speed)</div>
                      <div className="text-2xl font-bold text-blue-900">1.54 ± 0.19 kt</div>
                    </div>
                    <div>
                      <div className="text-xs text-blue-700">GST Error (Gust Speed)</div>
                      <div className="text-2xl font-bold text-blue-900">2.02 ± 0.16 kt</div>
                    </div>
                  </div>
                  <p className="text-xs text-blue-800 mt-2">
                    Natural variance baseline measured across multiple runs of identical inputs.
                    This represents the model's inherent uncertainty expression at default temperature.
                  </p>
                </div>

                {/* Configuration File Location */}
                <div className="mt-4 text-xs text-gray-600">
                  <strong>Config File:</strong> <code className="bg-gray-200 px-2 py-1 rounded ml-1">config/model_config.json</code>
                  <p className="mt-1">All forecasting components use the same configuration for consistency.</p>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Prompt Information */}
          {diagnosticData?.data?.prompt && (
            <CollapsibleSection
              title="Prompt Details"
              badge={`${diagnosticData.data.prompt.promptTokenEstimate.toLocaleString()} tokens`}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <DataRow label="Prompt Length" value={`${diagnosticData.data.prompt.promptLength.toLocaleString()} characters`} />
                  <DataRow label="Token Estimate" value={`~${diagnosticData.data.prompt.promptTokenEstimate.toLocaleString()} tokens`} />
                  <DataRow label="Requested Days" value={diagnosticData.data.prompt.requestedDays} />
                  <DataRow label="Includes Warnings" value={diagnosticData.data.prompt.includesWarnings ? 'Yes' : 'No'} />
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Full Prompt:</h3>
                  <pre className="bg-white rounded p-3 border border-gray-200 text-xs overflow-x-auto max-h-96 overflow-y-auto">
                    {diagnosticData.data.prompt.fullPrompt}
                  </pre>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Current Predictions */}
          {forecastData?.data?.predictions && (
            <CollapsibleSection title="Current Predictions" defaultOpen={false}>
              <div className="space-y-4">
                {forecastData.data.predictions.map((day, dayIdx) => (
                  <div key={dayIdx} className="bg-white rounded p-4 border border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-3">Day {dayIdx}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-3 py-2 text-left">Time</th>
                            <th className="px-3 py-2 text-right">Wind Speed</th>
                            <th className="px-3 py-2 text-right">Gust</th>
                            <th className="px-3 py-2 text-right">Direction</th>
                          </tr>
                        </thead>
                        <tbody>
                          {day.map((hour: any, hourIdx: number) => (
                            <tr key={hourIdx} className="border-t border-gray-200">
                              <td className="px-3 py-2">{hour.time}</td>
                              <td className="px-3 py-2 text-right font-mono">{hour.windSpeed?.toFixed(1)} kt</td>
                              <td className="px-3 py-2 text-right font-mono">{hour.gustSpeed?.toFixed(1)} kt</td>
                              <td className="px-3 py-2 text-right font-mono">
                                {hour.windDirection}° {hour.windDirectionText}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Raw JSON Data */}
          <CollapsibleSection title="Raw JSON Data">
            <pre className="bg-white rounded p-3 border border-gray-200 text-xs overflow-x-auto max-h-96 overflow-y-auto">
              {JSON.stringify({ diagnosticData, forecastData }, null, 2)}
            </pre>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
