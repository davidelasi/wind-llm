'use client';

import { useEffect, useState } from 'react';
import Navigation from '../../components/Navigation';
import { RefreshCw, CheckCircle, AlertTriangle, FlaskConical, Info } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  ErrorBar
} from 'recharts';

interface PythonVarianceData {
  test_date: string;
  num_runs: number;
  method: string;
  model_config?: {
    model: string;
    temperature: number;
    top_p: number;
    max_tokens: number;
  };
  runs: Array<{
    run: number;
    predictions: Array<{ hour: number; wspd_kt: number; gst_kt: number }>;
    avg_wspd_error: number;
    avg_gst_error: number;
  }>;
  actual_data: Array<{ hour: number; wspd_avg_kt: number; gst_max_kt: number }>;
  statistics: {
    wspd: { mean: number; std_dev: number; min: number; max: number; validated_value: number };
    gst: { mean: number; std_dev: number; min: number; max: number; validated_value: number };
  };
}

interface BoxPlotData {
  hour: string;
  hourNum: number;
  q1: number;
  median: number;
  q3: number;
  min: number;
  max: number;
  actual: number;
}

// Helper to calculate quartiles
function calculateQuartiles(values: number[]): { q1: number; median: number; q3: number; min: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);

  return {
    min: sorted[0],
    q1: sorted[q1Index],
    median,
    q3: sorted[q3Index],
    max: sorted[n - 1]
  };
}

// Convert hour to AM/PM format
function formatHour(hour: number): string {
  if (hour === 12) return '12 PM';
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export default function ValidationTestPage() {
  const [pythonData, setPythonData] = useState<PythonVarianceData | null>(null);
  const [pythonLoading, setPythonLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load cached Python test data on mount
  useEffect(() => {
    const loadCachedData = async () => {
      try {
        setPythonLoading(true);
        const response = await fetch('/data/variance_test_results_temp_1_0.json');
        if (response.ok) {
          const data = await response.json();
          setPythonData(data);
        } else {
          setError('No cached test results found. Please run the variance test first.');
        }
      } catch (err) {
        setError('Error loading test results');
        console.error('Error loading cached data:', err);
      } finally {
        setPythonLoading(false);
      }
    };
    loadCachedData();
  }, []);

  // Prepare box plot data for wind speed
  const wspdBoxPlotData: BoxPlotData[] = pythonData ? (() => {
    const hours = pythonData.actual_data.map(a => a.hour);
    return hours.map(hour => {
      const actual = pythonData.actual_data.find(a => a.hour === hour);
      const predictions = pythonData.runs
        .map(run => run.predictions.find(p => p.hour === hour)?.wspd_kt)
        .filter((v): v is number => v !== undefined);

      const stats = calculateQuartiles(predictions);

      return {
        hour: formatHour(hour),
        hourNum: hour,
        ...stats,
        actual: actual?.wspd_avg_kt || 0
      };
    });
  })() : [];

  // Prepare box plot data for gust speed
  const gstBoxPlotData: BoxPlotData[] = pythonData ? (() => {
    const hours = pythonData.actual_data.map(a => a.hour);
    return hours.map(hour => {
      const actual = pythonData.actual_data.find(a => a.hour === hour);
      const predictions = pythonData.runs
        .map(run => run.predictions.find(p => p.hour === hour)?.gst_kt)
        .filter((v): v is number => v !== undefined);

      const stats = calculateQuartiles(predictions);

      return {
        hour: formatHour(hour),
        hourNum: hour,
        ...stats,
        actual: actual?.gst_max_kt || 0
      };
    });
  })() : [];


  // Custom tooltip for box plots
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
          <p className="font-semibold">{data.hour}</p>
          <p className="text-sm text-gray-600">Actual: {data.actual.toFixed(1)} kt</p>
          <hr className="my-1" />
          <p className="text-xs">Max: {data.max.toFixed(1)} kt</p>
          <p className="text-xs">Q3 (75%): {data.q3.toFixed(1)} kt</p>
          <p className="text-xs font-semibold">Median (50%): {data.median.toFixed(1)} kt</p>
          <p className="text-xs">Q1 (25%): {data.q1.toFixed(1)} kt</p>
          <p className="text-xs">Min: {data.min.toFixed(1)} kt</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <FlaskConical className="h-8 w-8 text-[#005F73]" />
            <h1 className="text-3xl font-bold text-gray-900">
              LLM Wind Forecast Validation Test
            </h1>
          </div>
          <p className="text-gray-600">
            Test Date: 2023-07-15 | Validated approach using historical data
          </p>
        </div>

        {/* Methodology Documentation */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <div className="flex items-start space-x-3">
            <Info className="h-6 w-6 text-[#005F73] flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-blue-900 mb-3">Validation Methodology</h2>

              <div className="space-y-4 text-sm text-blue-900">
                <div>
                  <h3 className="font-semibold mb-1">Test Approach</h3>
                  <p>The same historical forecast (2023-07-15) is run multiple times to measure LLM prediction variance.
                  Each run uses identical inputs but produces slightly different outputs due to the stochastic nature of LLM inference.</p>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">Box Plot Interpretation</h3>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>Box</strong>: Interquartile range (IQR) = Q3 - Q1, contains middle 50% of predictions</li>
                    <li><strong>Line in box</strong>: Median (50th percentile) of all prediction runs</li>
                    <li><strong>Whiskers</strong>: Extend to minimum and maximum predicted values</li>
                    <li><strong>Red line</strong>: Actual observed wind conditions</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">Metrics Explained</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-2">
                    <div>
                      <strong>MAE (Mean Absolute Error)</strong>
                      <p className="text-xs mt-1">MAE = (1/n) × Σ|predicted - actual|</p>
                      <p className="text-xs text-gray-600">Average magnitude of prediction errors</p>
                    </div>
                    <div>
                      <strong>σ (Standard Deviation)</strong>
                      <p className="text-xs mt-1">σ = √[(1/n) × Σ(xᵢ - μ)²]</p>
                      <p className="text-xs text-gray-600">Measure of prediction variability across runs</p>
                    </div>
                    <div>
                      <strong>WSPD</strong>
                      <p className="text-xs text-gray-600">Average wind speed in knots (sustained wind)</p>
                    </div>
                    <div>
                      <strong>GST</strong>
                      <p className="text-xs text-gray-600">Maximum gust speed in knots (peak wind)</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-1">Model Configuration</h3>
                  {pythonData?.model_config && (
                    <div className="text-xs bg-white rounded p-2 font-mono">
                      <p>Model: {pythonData.model_config.model}</p>
                      <p>Temperature: {pythonData.model_config.temperature} (controls randomness)</p>
                      <p>Top-p: {pythonData.model_config.top_p} (nucleus sampling)</p>
                      <p>Max Tokens: {pythonData.model_config.max_tokens}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {pythonLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#005F73]"></div>
              <span className="text-gray-600">Loading test results...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Statistics Summary */}
        {pythonData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Wind Speed (WSPD) Statistics</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Number of runs:</span>
                  <span className="font-semibold">{pythonData.num_runs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Mean Error (MAE):</span>
                  <span className="font-semibold">{pythonData.statistics.wspd.mean.toFixed(2)} kt</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Std Deviation (σ):</span>
                  <span className="font-semibold">{pythonData.statistics.wspd.std_dev.toFixed(2)} kt</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Error Range:</span>
                  <span className="font-semibold">
                    {pythonData.statistics.wspd.min.toFixed(2)} - {pythonData.statistics.wspd.max.toFixed(2)} kt
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Gust Speed (GST) Statistics</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Number of runs:</span>
                  <span className="font-semibold">{pythonData.num_runs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Mean Error (MAE):</span>
                  <span className="font-semibold">{pythonData.statistics.gst.mean.toFixed(2)} kt</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Std Deviation (σ):</span>
                  <span className="font-semibold">{pythonData.statistics.gst.std_dev.toFixed(2)} kt</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Error Range:</span>
                  <span className="font-semibold">
                    {pythonData.statistics.gst.min.toFixed(2)} - {pythonData.statistics.gst.max.toFixed(2)} kt
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Wind Speed Chart */}
        {wspdBoxPlotData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Wind Speed (WSPD) - Prediction Variance
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Box plots show distribution of {pythonData?.num_runs} prediction runs. Red line shows actual observed conditions.
            </p>
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={wspdBoxPlotData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis
                  label={{ value: 'Wind Speed (knots)', angle: -90, position: 'insideLeft' }}
                  domain={[0, 'dataMax + 2']}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />

                {/* Min-Max range as bars */}
                <Bar dataKey="min" stackId="a" fill="none" />
                <Bar
                  dataKey={(data) => data.q1 - data.min}
                  stackId="a"
                  fill="#93c5fd"
                  fillOpacity={0.3}
                />
                <Bar
                  dataKey={(data) => data.q3 - data.q1}
                  stackId="a"
                  fill="#3b82f6"
                  fillOpacity={0.7}
                  name="IQR (25%-75%)"
                />
                <Bar
                  dataKey={(data) => data.max - data.q3}
                  stackId="a"
                  fill="#93c5fd"
                  fillOpacity={0.3}
                />

                {/* Median line */}
                <Line
                  type="monotone"
                  dataKey="median"
                  stroke="#1e40af"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#1e40af', stroke: '#fff', strokeWidth: 2 }}
                  name="Median Prediction"
                />

                {/* Actual wind speed */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#ef4444"
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#ef4444' }}
                  name="Actual WSPD"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Gust Speed Chart */}
        {gstBoxPlotData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Gust Speed (GST) - Prediction Variance
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Box plots show distribution of {pythonData?.num_runs} prediction runs. Red line shows actual observed conditions.
            </p>
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={gstBoxPlotData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis
                  label={{ value: 'Gust Speed (knots)', angle: -90, position: 'insideLeft' }}
                  domain={[0, 'dataMax + 2']}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />

                {/* Min-Max range as bars */}
                <Bar dataKey="min" stackId="a" fill="none" />
                <Bar
                  dataKey={(data) => data.q1 - data.min}
                  stackId="a"
                  fill="#86efac"
                  fillOpacity={0.3}
                />
                <Bar
                  dataKey={(data) => data.q3 - data.q1}
                  stackId="a"
                  fill="#10b981"
                  fillOpacity={0.7}
                  name="IQR (25%-75%)"
                />
                <Bar
                  dataKey={(data) => data.max - data.q3}
                  stackId="a"
                  fill="#86efac"
                  fillOpacity={0.3}
                />

                {/* Median line */}
                <Line
                  type="monotone"
                  dataKey="median"
                  stroke="#047857"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#047857', stroke: '#fff', strokeWidth: 2 }}
                  name="Median Prediction"
                />

                {/* Actual gust speed */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#ef4444"
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#ef4444' }}
                  name="Actual GST"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </main>
    </div>
  );
}
