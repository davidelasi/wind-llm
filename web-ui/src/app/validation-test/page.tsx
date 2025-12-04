'use client';

import { useEffect, useState } from 'react';
import Navigation from '../../components/Navigation';
import { RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface ValidationData {
  testDate: string;
  forecast: string;
  actualData: Array<{ hour: number; wspd: number; gst: number }>;
  predictions: Array<{ hour: number; wspd_kt: number; gst_kt: number }>;
  errors: Array<{
    hour: number;
    actual_wspd: number;
    predicted_wspd: number;
    wspd_error: number;
    actual_gst: number;
    predicted_gst: number;
    gst_error: number;
  }>;
  summary: {
    avgWspdError: string;
    avgGstError: string;
    validatedWspdError: string;
    validatedGstError: string;
    examplesUsed: number;
    hoursCompared: number;
  };
}

interface VarianceData {
  testDate: string;
  numRuns: number;
  statistics: {
    wspd: {
      mean: number;
      stdDev: number;
      min: number;
      max: number;
      validatedValue: number;
    };
    gst: {
      mean: number;
      stdDev: number;
      min: number;
      max: number;
      validatedValue: number;
    };
  };
}

export default function ValidationTestPage() {
  const [data, setData] = useState<ValidationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [varianceData, setVarianceData] = useState<VarianceData | null>(null);
  const [varianceLoading, setVarianceLoading] = useState(false);
  const [numRuns, setNumRuns] = useState(5);

  const fetchValidationTest = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/validation-test');
      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || 'Failed to run validation test');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Validation test error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchValidationTest();
  }, []);

  const fetchVarianceTest = async () => {
    try {
      setVarianceLoading(true);
      setError(null);

      const response = await fetch(`/api/validation-variance?runs=${numRuns}`);
      const result = await response.json();

      if (result.success) {
        setVarianceData(result.data);
      } else {
        setError(result.error || 'Failed to run variance test');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Variance test error:', err);
    } finally {
      setVarianceLoading(false);
    }
  };

  // Prepare chart data
  const chartData = data?.errors.map(e => ({
    hour: `${e.hour}:00`,
    'Actual WSPD': e.actual_wspd,
    'Predicted WSPD': e.predicted_wspd,
    'Actual GST': e.actual_gst,
    'Predicted GST': e.predicted_gst,
  })) || [];

  // Check if results match validation
  const wspdMatches = data ? Math.abs(parseFloat(data.summary.avgWspdError) - parseFloat(data.summary.validatedWspdError)) < 0.5 : false;
  const gstMatches = data ? Math.abs(parseFloat(data.summary.avgGstError) - parseFloat(data.summary.validatedGstError)) < 0.5 : false;
  const overallMatch = wspdMatches && gstMatches;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">Running validation test...</p>
          <p className="text-sm text-gray-500 mt-2">Calling Claude API with 2023-07-15 data</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-red-50 rounded-lg shadow-lg p-6 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Error Running Validation Test</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={fetchValidationTest}
              className="bg-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Validation Test</h1>
              <p className="text-sm text-gray-600">2023-07-15 Forecast Accuracy Comparison</p>
            </div>

            <button
              onClick={fetchValidationTest}
              disabled={loading}
              className="p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Results Comparison */}
        {data && (
          <>
            {/* Status Card */}
            <div className={`rounded-lg shadow-sm p-6 mb-6 ${
              overallMatch ? 'bg-green-50 border-2 border-green-500' : 'bg-yellow-50 border-2 border-yellow-500'
            }`}>
              <div className="flex items-start gap-4">
                {overallMatch ? (
                  <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-yellow-600 flex-shrink-0" />
                )}

                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-800 mb-2">
                    {overallMatch ? '✅ Results Match Validation!' : '⚠️ Results Differ from Validation'}
                  </h2>

                  <div className="grid grid-cols-2 gap-6 mt-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">WSPD Error:</p>
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-xs text-gray-600">Validated (Python):</p>
                          <p className="text-2xl font-bold text-green-700">{data.summary.validatedWspdError}kt</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Current (Production):</p>
                          <p className={`text-2xl font-bold ${
                            wspdMatches ? 'text-green-700' : 'text-yellow-700'
                          }`}>{data.summary.avgWspdError}kt</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">GST Error:</p>
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-xs text-gray-600">Validated (Python):</p>
                          <p className="text-2xl font-bold text-green-700">{data.summary.validatedGstError}kt</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Current (Production):</p>
                          <p className={`text-2xl font-bold ${
                            gstMatches ? 'text-green-700' : 'text-yellow-700'
                          }`}>{data.summary.avgGstError}kt</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {!overallMatch && (
                    <div className="mt-4 p-3 bg-yellow-100 rounded border border-yellow-300">
                      <p className="text-sm text-yellow-800">
                        <strong>Warning:</strong> Current production results differ from validated test.
                        This may indicate a regression in the forecast accuracy due to recent code changes.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Test Details */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Test Details</h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Test Date:</p>
                  <p className="font-mono font-semibold">{data.testDate}</p>
                </div>
                <div>
                  <p className="text-gray-600">Training Examples Used:</p>
                  <p className="font-mono font-semibold">{data.summary.examplesUsed}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-600">NWS Forecast:</p>
                  <p className="font-mono text-blue-600">{data.forecast}</p>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Actual vs Predicted Wind</h3>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 12, fill: '#374151' }}
                      axisLine={{ stroke: '#9ca3af' }}
                      tickLine={{ stroke: '#9ca3af' }}
                    />
                    <YAxis
                      domain={[0, 20]}
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
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="Actual WSPD"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#10b981' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Predicted WSPD"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 4, fill: '#3b82f6' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Actual GST"
                      stroke="#ef4444"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#ef4444' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Predicted GST"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 4, fill: '#f59e0b' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Variance Testing Section */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Variance Testing</h3>
              <p className="text-sm text-gray-600 mb-4">
                Run the same forecast multiple times to measure LLM prediction variance.
                This helps determine if differences are due to natural variance or code issues.
              </p>

              <div className="flex items-center gap-4 mb-4">
                <div>
                  <label className="text-sm text-gray-700 mr-2">Number of runs:</label>
                  <select
                    value={numRuns}
                    onChange={(e) => setNumRuns(parseInt(e.target.value))}
                    className="border border-gray-300 rounded px-3 py-2 text-sm"
                    disabled={varianceLoading}
                  >
                    <option value="3">3 runs</option>
                    <option value="5">5 runs</option>
                    <option value="7">7 runs</option>
                    <option value="10">10 runs</option>
                  </select>
                </div>

                <button
                  onClick={fetchVarianceTest}
                  disabled={varianceLoading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2"
                >
                  {varianceLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Running {numRuns} predictions...
                    </>
                  ) : (
                    `Run ${numRuns} Predictions`
                  )}
                </button>
              </div>

              {varianceData && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Variance Test Results ({varianceData.numRuns} runs)</h4>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">WSPD Error Statistics:</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-gray-600">Mean:</span> <span className="font-mono font-bold">{varianceData.statistics.wspd.mean.toFixed(2)}kt</span></p>
                        <p><span className="text-gray-600">Std Dev:</span> <span className="font-mono">±{varianceData.statistics.wspd.stdDev.toFixed(2)}kt</span></p>
                        <p><span className="text-gray-600">Range:</span> <span className="font-mono">{varianceData.statistics.wspd.min.toFixed(2)} - {varianceData.statistics.wspd.max.toFixed(2)}kt</span></p>
                        <p className="mt-2 pt-2 border-t border-gray-300">
                          <span className="text-gray-600">Validated:</span> <span className="font-mono font-bold text-green-700">{varianceData.statistics.wspd.validatedValue.toFixed(1)}kt</span>
                        </p>
                        <p className={`text-xs ${
                          data && parseFloat(data.summary.avgWspdError) >= varianceData.statistics.wspd.mean - 2 * varianceData.statistics.wspd.stdDev &&
                          parseFloat(data.summary.avgWspdError) <= varianceData.statistics.wspd.mean + 2 * varianceData.statistics.wspd.stdDev
                            ? 'text-green-600' : 'text-yellow-600'
                        }`}>
                          {data && (
                            <>Production: {data.summary.avgWspdError}kt
                            ({parseFloat(data.summary.avgWspdError) >= varianceData.statistics.wspd.mean - 2 * varianceData.statistics.wspd.stdDev &&
                              parseFloat(data.summary.avgWspdError) <= varianceData.statistics.wspd.mean + 2 * varianceData.statistics.wspd.stdDev
                              ? ' ✓ within 2σ' : ' ⚠ outside 2σ'})</>
                          )}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">GST Error Statistics:</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="text-gray-600">Mean:</span> <span className="font-mono font-bold">{varianceData.statistics.gst.mean.toFixed(2)}kt</span></p>
                        <p><span className="text-gray-600">Std Dev:</span> <span className="font-mono">±{varianceData.statistics.gst.stdDev.toFixed(2)}kt</span></p>
                        <p><span className="text-gray-600">Range:</span> <span className="font-mono">{varianceData.statistics.gst.min.toFixed(2)} - {varianceData.statistics.gst.max.toFixed(2)}kt</span></p>
                        <p className="mt-2 pt-2 border-t border-gray-300">
                          <span className="text-gray-600">Validated:</span> <span className="font-mono font-bold text-green-700">{varianceData.statistics.gst.validatedValue.toFixed(1)}kt</span>
                        </p>
                        <p className={`text-xs ${
                          data && parseFloat(data.summary.avgGstError) >= varianceData.statistics.gst.mean - 2 * varianceData.statistics.gst.stdDev &&
                          parseFloat(data.summary.avgGstError) <= varianceData.statistics.gst.mean + 2 * varianceData.statistics.gst.stdDev
                            ? 'text-green-600' : 'text-yellow-600'
                        }`}>
                          {data && (
                            <>Production: {data.summary.avgGstError}kt
                            ({parseFloat(data.summary.avgGstError) >= varianceData.statistics.gst.mean - 2 * varianceData.statistics.gst.stdDev &&
                              parseFloat(data.summary.avgGstError) <= varianceData.statistics.gst.mean + 2 * varianceData.statistics.gst.stdDev
                              ? ' ✓ within 2σ' : ' ⚠ outside 2σ'})</>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
                    <p className="text-xs text-blue-800">
                      <strong>Interpretation:</strong> If production results fall within ±2σ (two standard deviations) of the mean,
                      the differences are likely due to natural LLM variance, not code issues.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Detailed Errors Table */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Hourly Comparison</h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-2 px-3">Hour</th>
                      <th className="text-right py-2 px-3">Actual WSPD</th>
                      <th className="text-right py-2 px-3">Predicted WSPD</th>
                      <th className="text-right py-2 px-3">Error</th>
                      <th className="text-right py-2 px-3">Actual GST</th>
                      <th className="text-right py-2 px-3">Predicted GST</th>
                      <th className="text-right py-2 px-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.errors.map((e, idx) => (
                      <tr key={idx} className="border-b border-gray-200">
                        <td className="py-2 px-3 font-mono">{e.hour}:00</td>
                        <td className="text-right py-2 px-3 font-mono text-green-700">{e.actual_wspd.toFixed(1)}kt</td>
                        <td className="text-right py-2 px-3 font-mono text-blue-600">{e.predicted_wspd.toFixed(1)}kt</td>
                        <td className={`text-right py-2 px-3 font-mono font-semibold ${
                          e.wspd_error < 2 ? 'text-green-600' : e.wspd_error < 4 ? 'text-yellow-600' : 'text-red-600'
                        }`}>{e.wspd_error.toFixed(1)}kt</td>
                        <td className="text-right py-2 px-3 font-mono text-red-700">{e.actual_gst.toFixed(1)}kt</td>
                        <td className="text-right py-2 px-3 font-mono text-orange-600">{e.predicted_gst.toFixed(1)}kt</td>
                        <td className={`text-right py-2 px-3 font-mono font-semibold ${
                          e.gst_error < 2 ? 'text-green-600' : e.gst_error < 4 ? 'text-yellow-600' : 'text-red-600'
                        }`}>{e.gst_error.toFixed(1)}kt</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
