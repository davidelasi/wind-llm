'use client';

/**
 * Statistics Page
 *
 * Compare LLM wind forecasts against actual wind measurements on a solar time basis.
 * Select any forecast from the database and view hourly comparison charts.
 */

import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import ForecastSelector from '@/components/statistics/ForecastSelector';
import DayComparisonCard from '@/components/statistics/DayComparisonCard';

interface HourlyComparison {
  hour: number;
  displayTime: string;
  forecast: { wspd: number; gst: number } | null;
  actual: { wspd: number; gst: number } | null;
  error: { wspd: number; gst: number } | null;
}

interface DayComparison {
  dayIndex: number;
  date: string;
  displayDate: string;
  dayLabel: string;
  hourly: HourlyComparison[];
  summary: {
    avgWspdError: number | null;
    avgGstError: number | null;
    maxWspdError: number | null;
    maxGstError: number | null;
    hoursWithActuals: number;
    totalHours: number;
  };
  status: 'complete' | 'partial' | 'no_data' | 'future';
}

interface ForecastComparison {
  forecastId: string;
  nwsIssuedAt: string;
  llmGeneratedAt: string;
  displayGeneratedAt: string;
  days: DayComparison[];
  overallSummary: {
    totalHoursCompared: number;
    avgWspdError: number | null;
    avgGstError: number | null;
    daysWithData: number;
    totalDays: number;
  };
}

export default function Statistics() {
  const [selectedForecastId, setSelectedForecastId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ForecastComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComparison = useCallback(async (forecastId: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/statistics/comparison?forecastId=${forecastId}`);
      const data = await response.json();

      if (data.success) {
        setComparison(data.data);
      } else {
        setError(data.error || 'Failed to load comparison data');
        setComparison(null);
      }
    } catch (err) {
      setError('Failed to fetch comparison data');
      setComparison(null);
      console.error('Error fetching comparison:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedForecastId) {
      fetchComparison(selectedForecastId);
    }
  }, [selectedForecastId, fetchComparison]);

  const handleForecastSelect = (forecastId: string) => {
    setSelectedForecastId(forecastId);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Forecast Accuracy Statistics
          </h1>
          <p className="text-gray-600 text-sm mb-4">
            Compare LLM-generated wind forecasts against actual measurements from NOAA buoy AGXC1.
            Data is compared on a solar time basis (same PST hour-of-day).
          </p>

          {/* Forecast Selector */}
          <ForecastSelector
            selectedId={selectedForecastId}
            onSelect={handleForecastSelect}
          />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-4 text-gray-600">Loading comparison data...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Comparison Results */}
        {comparison && !loading && (
          <div className="space-y-6">
            {/* Overall Summary */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Overall Summary
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Hours Compared</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {comparison.overallSummary.totalHoursCompared}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Days with Data</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {comparison.overallSummary.daysWithData}/{comparison.overallSummary.totalDays}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Avg WSPD Error</p>
                  <p className={`text-2xl font-bold mt-1 ${
                    comparison.overallSummary.avgWspdError !== null
                      ? comparison.overallSummary.avgWspdError <= 2 ? 'text-green-600' : 'text-yellow-600'
                      : 'text-gray-400'
                  }`}>
                    {comparison.overallSummary.avgWspdError !== null
                      ? `${comparison.overallSummary.avgWspdError.toFixed(1)} kt`
                      : '--'}
                  </p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Avg GST Error</p>
                  <p className={`text-2xl font-bold mt-1 ${
                    comparison.overallSummary.avgGstError !== null
                      ? comparison.overallSummary.avgGstError <= 2 ? 'text-green-600' : 'text-yellow-600'
                      : 'text-gray-400'
                  }`}>
                    {comparison.overallSummary.avgGstError !== null
                      ? `${comparison.overallSummary.avgGstError.toFixed(1)} kt`
                      : '--'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4 text-center">
                Forecast generated: {comparison.displayGeneratedAt} PST
              </p>
            </div>

            {/* Day-by-Day Comparison */}
            <div className="space-y-4">
              {comparison.days.map((day) => (
                <DayComparisonCard
                  key={day.dayIndex}
                  dayIndex={day.dayIndex}
                  date={day.date}
                  displayDate={day.displayDate}
                  dayLabel={day.dayLabel}
                  hourly={day.hourly}
                  summary={day.summary}
                  status={day.status}
                />
              ))}
            </div>

            {/* Legend */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Legend</h3>
              <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-blue-500 rounded mr-2" />
                  <span>Forecast prediction</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-orange-500 rounded-full mr-2" />
                  <span>Actual measurement</span>
                </div>
                <div className="flex items-center">
                  <span className="text-green-600 font-medium mr-1">Green error:</span>
                  <span>&le; 2 kt (good)</span>
                </div>
                <div className="flex items-center">
                  <span className="text-yellow-600 font-medium mr-1">Yellow error:</span>
                  <span>2-4 kt (moderate)</span>
                </div>
                <div className="flex items-center">
                  <span className="text-red-600 font-medium mr-1">Red error:</span>
                  <span>&gt; 4 kt (high)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State - No forecast selected */}
        {!selectedForecastId && !loading && (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="mt-4">Select a forecast above to view accuracy statistics</p>
          </div>
        )}
      </div>
    </div>
  );
}
