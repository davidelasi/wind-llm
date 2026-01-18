'use client';

/**
 * ForecastSelector Component
 *
 * Dropdown to select a forecast from the database for comparison analysis.
 */

import { useState, useEffect } from 'react';

interface ForecastOption {
  id: string;
  nwsIssuedAt: string;
  llmGeneratedAt: string;
  displayLabel: string;
  month: string;
  forecastNumber: number;
}

interface ForecastSelectorProps {
  selectedId: string | null;
  onSelect: (forecastId: string) => void;
}

export default function ForecastSelector({
  selectedId,
  onSelect,
}: ForecastSelectorProps) {
  const [forecasts, setForecasts] = useState<ForecastOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchForecasts() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/statistics/comparison?limit=30');
        const data = await response.json();

        if (data.success) {
          setForecasts(data.data.forecasts);

          // Auto-select the first forecast if none selected
          if (!selectedId && data.data.forecasts.length > 0) {
            onSelect(data.data.forecasts[0].id);
          }
        } else {
          setError(data.error || 'Failed to load forecasts');
        }
      } catch (err) {
        setError('Failed to fetch forecasts');
        console.error('Error fetching forecasts:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchForecasts();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <label className="text-sm font-medium text-gray-700">
          Select Forecast:
        </label>
        <div className="animate-pulse bg-gray-200 h-10 w-64 rounded-md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2">
        <label className="text-sm font-medium text-gray-700">
          Select Forecast:
        </label>
        <span className="text-red-600 text-sm">{error}</span>
      </div>
    );
  }

  if (forecasts.length === 0) {
    return (
      <div className="flex items-center space-x-2">
        <label className="text-sm font-medium text-gray-700">
          Select Forecast:
        </label>
        <span className="text-gray-500 text-sm">No forecasts available</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <label
        htmlFor="forecast-select"
        className="text-sm font-medium text-gray-700 whitespace-nowrap"
      >
        Select Forecast:
      </label>
      <select
        id="forecast-select"
        value={selectedId || ''}
        onChange={(e) => onSelect(e.target.value)}
        className="block w-full sm:w-auto min-w-[300px] px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
      >
        {forecasts.map((forecast) => (
          <option key={forecast.id} value={forecast.id}>
            {forecast.displayLabel}
          </option>
        ))}
      </select>
      <span className="text-xs text-gray-500">
        ({forecasts.length} forecasts available)
      </span>
    </div>
  );
}
