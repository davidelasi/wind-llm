'use client';

import { useEffect, useState } from 'react';
import Navigation from '../../components/Navigation';

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

export default function DebugPage() {
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

  useEffect(() => {
    fetchWindData();
    fetchNoaaData();

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
    if (speed < 14) return { category: 'Moderate', color: 'text-blue-600' };
    if (speed < 21) return { category: 'Fresh', color: 'text-orange-600' };
    if (speed < 28) return { category: 'Strong', color: 'text-red-600' };
    return { category: 'Gale', color: 'text-purple-600' };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Debug Console</h1>
          <p className="text-sm text-gray-600">Wind data sources and technical information</p>
        </div>

        {/* Wind Data Debug Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">AGXC1 Station Data</h2>
              <p className="text-xs text-gray-600">Raw station measurements • Updated: {lastUpdate}</p>
            </div>
            <button
              onClick={fetchWindData}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
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
                    className="text-sm text-blue-600 hover:text-blue-800 underline mb-2"
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
        <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-500">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">NOAA API Observations</h2>
              <p className="text-xs text-gray-600">JSON API • api.weather.gov • Updated: {lastNoaaUpdate}</p>
            </div>
            <button
              onClick={fetchNoaaData}
              disabled={noaaLoading}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
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
                    className="text-sm text-purple-600 hover:text-purple-800 underline mb-2"
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
          <h2 className="text-lg font-semibold text-gray-800 mb-4">API Reference</h2>
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
    </div>
  );
}