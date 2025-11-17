'use client';

import { useEffect, useState } from 'react';

interface WindData {
  datetime: string;
  windDirection: number;
  windSpeed: number;
  gustSpeed: number;
  pressure: number;
  airTemp: number;
  waterTemp: number;
}

interface ApiResponse {
  success: boolean;
  data?: WindData;
  station?: string;
  location?: string;
  lastUpdated?: string;
  error?: string;
  message?: string;
  debug?: any;
}

export default function Home() {
  const [windData, setWindData] = useState<WindData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [showDebug, setShowDebug] = useState(false);

  const fetchWindData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/wind-data');
      const data: ApiResponse = await response.json();

      // Always capture debug info if available
      setDebugInfo(data.debug || null);

      if (data.success && data.data) {
        setWindData(data.data);
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

  useEffect(() => {
    fetchWindData();
    const interval = setInterval(fetchWindData, 5 * 60 * 1000); // Refresh every 5 minutes
    return () => clearInterval(interval);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-100 px-4 py-6">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Wind Conditions</h1>
          <p className="text-sm text-gray-600">AGXC1 - Los Angeles, CA</p>
          <p className="text-xs text-gray-500">Last updated: {lastUpdate}</p>
        </div>

        {/* Main Wind Data Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          {/* Wind Speed */}
          <div className="text-center mb-6">
            <div className="text-5xl font-bold text-gray-800 mb-2">
              {windData.windSpeed.toFixed(1)}
              <span className="text-2xl text-gray-600 ml-1">kt</span>
            </div>
            <div className={`text-lg font-semibold ${windCategory.color}`}>
              {windCategory.category}
            </div>
          </div>

          {/* Wind Details Grid */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-sm text-gray-600 mb-1">Direction</div>
              <div className="text-xl font-bold text-gray-800">
                {windDir}
              </div>
              <div className="text-xs text-gray-500">{windData.windDirection}°</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-sm text-gray-600 mb-1">Gusts</div>
              <div className="text-xl font-bold text-gray-800">
                {windData.gustSpeed.toFixed(1)}
                <span className="text-sm text-gray-600 ml-1">kt</span>
              </div>
            </div>
          </div>
        </div>

        {/* Environmental Data - Only show if available */}
        {(windData.airTemp > 0 || windData.waterTemp > 0 || windData.pressure > 0) && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Environmental</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">Air Temp</div>
                <div className="text-lg font-bold text-gray-800">
                  {windData.airTemp > 0 ? `${windData.airTemp.toFixed(1)}°F` : 'N/A'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">Water Temp</div>
                <div className="text-lg font-bold text-gray-800">
                  {windData.waterTemp > 0 ? `${windData.waterTemp.toFixed(1)}°F` : 'N/A'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">Pressure</div>
                <div className="text-lg font-bold text-gray-800">
                  {windData.pressure > 0 ? (
                    <>
                      {windData.pressure.toFixed(0)}
                      <span className="text-xs text-gray-600 ml-1">mb</span>
                    </>
                  ) : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Refresh Button */}
        <div className="text-center">
          <button
            onClick={fetchWindData}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>

        {/* Data Timestamp */}
        <div className="text-center mt-4">
          <p className="text-xs text-gray-500">
            Station reading: {new Date(windData.datetime).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
