'use client';

import { useEffect, useState } from 'react';
import Navigation from '../../components/Navigation';
import { RefreshCw, CheckCircle, AlertTriangle, FlaskConical, Code } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';

interface PythonVarianceData {
  test_date: string;
  num_runs: number;
  method: string;
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

interface ProductionTestData {
  predictions: Array<{ hour: number; wspd_kt: number; gst_kt: number }>;
  summary: {
    avgWspdError: string;
    avgGstError: string;
  };
}

export default function ValidationTestPage() {
  const [pythonData, setPythonData] = useState<PythonVarianceData | null>(null);
  const [pythonLoading, setPythonLoading] = useState(false);
  const [productionData, setProductionData] = useState<ProductionTestData | null>(null);
  const [productionLoading, setProductionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numRuns, setNumRuns] = useState(5);

  const fetchPythonTest = async (force = false) => {
    try {
      setPythonLoading(true);
      setError(null);

      const response = await fetch(`/api/python-variance-test?runs=${numRuns}&force=${force}`);
      const result = await response.json();

      if (result.success) {
        setPythonData(result.data);
      } else {
        setError(result.error || 'Failed to run Python test');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Python test error:', err);
    } finally {
      setPythonLoading(false);
    }
  };

  const fetchProductionTest = async () => {
    try {
      setProductionLoading(true);
      setError(null);

      const response = await fetch('/api/validation-test');
      const result = await response.json();

      if (result.success) {
        setProductionData({
          predictions: result.data.predictions,
          summary: result.data.summary
        });
      } else {
        setError(result.error || 'Failed to run production test');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Production test error:', err);
    } finally {
      setProductionLoading(false);
    }
  };

  // Prepare chart data for overlapping variance runs
  const varianceChartData = pythonData ? (() => {
    const hours = pythonData.actual_data.map(a => a.hour);
    const chartData = hours.map(hour => {
      const actual = pythonData.actual_data.find(a => a.hour === hour);
      const dataPoint: any = {
        hour: `${hour}:00`,
        'Actual WSPD': actual?.wspd_avg_kt,
        'Actual GST': actual?.gst_max_kt
      };

      // Add each run's predictions
      pythonData.runs.forEach((run, idx) => {
        const pred = run.predictions.find(p => p.hour === hour);
        if (pred) {
          dataPoint[`Run ${run.run} WSPD`] = pred.wspd_kt;
          dataPoint[`Run ${run.run} GST`] = pred.gst_kt;
        }
      });

      return dataPoint;
    });

    return chartData;
  })() : [];

  // Comparison chart data
  const comparisonChartData = pythonData && productionData ? (() => {
    const hours = pythonData.actual_data.map(a => a.hour);
    return hours.map(hour => {
      const actual = pythonData.actual_data.find(a => a.hour === hour);
      const prodPred = productionData.predictions.find(p => p.hour === hour);

      // Calculate mean of Python runs
      const pythonPreds = pythonData.runs
        .map(run => run.predictions.find(p => p.hour === hour))
        .filter(p => p !== undefined);

      const meanPythonWspd = pythonPreds.length > 0
        ? pythonPreds.reduce((sum, p) => sum + (p?.wspd_kt || 0), 0) / pythonPreds.length
        : null;

      const meanPythonGst = pythonPreds.length > 0
        ? pythonPreds.reduce((sum, p) => sum + (p?.gst_kt || 0), 0) / pythonPreds.length
        : null;

      return {
        hour: `${hour}:00`,
        'Actual WSPD': actual?.wspd_avg_kt,
        'Actual GST': actual?.gst_max_kt,
        'Python Mean WSPD': meanPythonWspd,
        'Python Mean GST': meanPythonGst,
        'Production WSPD': prodPred?.wspd_kt,
        'Production GST': prodPred?.gst_kt
      };
    });
  })() : [];

  // Generate colors for variance runs
  const generateRunColors = (numRuns: number) => {
    const colors = [];
    for (let i = 0; i < numRuns; i++) {
      const hue = (i * 360 / numRuns);
      colors.push({
        wspd: `hsl(${hue}, 70%, 50%)`,
        gst: `hsl(${hue}, 70%, 70%)`
      });
    }
    return colors;
  };

  const runColors = pythonData ? generateRunColors(pythonData.num_runs) : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Forecast Validation & Variance Analysis</h1>
          <p className="text-sm text-gray-600">
            2023-07-15 Test: Compare Python testing script vs Production API accuracy
          </p>
        </div>

        {/* Control Panel */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Python Test Control */}
            <div className="border-r border-gray-200 pr-6">
              <div className="flex items-center gap-2 mb-3">
                <Code className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold text-gray-800">Python Test (Validated Method)</h3>
              </div>
              <p className="text-xs text-gray-600 mb-4">
                Uses Python scripts with validated approach. Runs multiple times to measure LLM variance.
              </p>

              <div className="flex items-center gap-3">
                <div>
                  <label className="text-sm text-gray-700 mr-2">Runs:</label>
                  <select
                    value={numRuns}
                    onChange={(e) => setNumRuns(parseInt(e.target.value))}
                    className="border border-gray-300 rounded px-3 py-2 text-sm"
                    disabled={pythonLoading}
                  >
                    <option value="3">3</option>
                    <option value="5">5</option>
                    <option value="7">7</option>
                    <option value="10">10</option>
                  </select>
                </div>

                <button
                  onClick={() => fetchPythonTest(true)}
                  disabled={pythonLoading}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm flex items-center gap-2"
                >
                  {pythonLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <FlaskConical className="h-4 w-4" />
                      Run Python Test
                    </>
                  )}
                </button>
              </div>

              {pythonData && !pythonLoading && (
                <div className="mt-3 p-3 bg-green-50 rounded border border-green-200 text-xs">
                  <p className="font-semibold text-green-800">Completed {pythonData.num_runs} runs</p>
                  <p className="text-green-700">
                    WSPD: {pythonData.statistics.wspd.mean.toFixed(2)} ± {pythonData.statistics.wspd.std_dev.toFixed(2)}kt
                  </p>
                  <p className="text-green-700">
                    GST: {pythonData.statistics.gst.mean.toFixed(2)} ± {pythonData.statistics.gst.std_dev.toFixed(2)}kt
                  </p>
                </div>
              )}
            </div>

            {/* Production Test Control */}
            <div className="pl-6">
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-800">Production API Test</h3>
              </div>
              <p className="text-xs text-gray-600 mb-4">
                Uses production web-ui API endpoints. Single run only (expensive API calls).
              </p>

              <button
                onClick={fetchProductionTest}
                disabled={productionLoading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2"
              >
                {productionLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  'Run Production Test'
                )}
              </button>

              {productionData && !productionLoading && (
                <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200 text-xs">
                  <p className="font-semibold text-blue-800">Completed 1 run</p>
                  <p className="text-blue-700">WSPD Error: {productionData.summary.avgWspdError}kt</p>
                  <p className="text-blue-700">GST Error: {productionData.summary.avgGstError}kt</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 rounded-lg p-4 mb-6 border border-red-200">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Python Variance Visualization */}
        {pythonData && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Python Test: All {pythonData.num_runs} Runs Overlapped
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This shows the natural variance of LLM predictions when using the same prompt multiple times.
            </p>

            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={varianceChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis
                    domain={[0, 20]}
                    label={{ value: 'Wind Speed (knots)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />

                  {/* Actual data - thick black lines */}
                  <Line type="monotone" dataKey="Actual WSPD" stroke="#000000" strokeWidth={3} dot={{ r: 5 }} />
                  <Line type="monotone" dataKey="Actual GST" stroke="#666666" strokeWidth={3} dot={{ r: 5 }} strokeDasharray="5 5" />

                  {/* All prediction runs - thin colored lines */}
                  {pythonData.runs.map((run, idx) => (
                    <Line
                      key={`wspd-${run.run}`}
                      type="monotone"
                      dataKey={`Run ${run.run} WSPD`}
                      stroke={runColors[idx].wspd}
                      strokeWidth={1}
                      dot={false}
                    />
                  ))}
                  {pythonData.runs.map((run, idx) => (
                    <Line
                      key={`gst-${run.run}`}
                      type="monotone"
                      dataKey={`Run ${run.run} GST`}
                      stroke={runColors[idx].gst}
                      strokeWidth={1}
                      dot={false}
                      strokeDasharray="3 3"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Statistics */}
            <div className="mt-6 grid grid-cols-2 gap-6 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">WSPD Error Statistics:</p>
                <div className="text-sm space-y-1">
                  <p><span className="text-gray-600">Mean:</span> <span className="font-mono font-bold">{pythonData.statistics.wspd.mean.toFixed(2)}kt</span></p>
                  <p><span className="text-gray-600">Std Dev:</span> <span className="font-mono">±{pythonData.statistics.wspd.std_dev.toFixed(2)}kt</span></p>
                  <p><span className="text-gray-600">Range:</span> <span className="font-mono">{pythonData.statistics.wspd.min.toFixed(2)} - {pythonData.statistics.wspd.max.toFixed(2)}kt</span></p>
                  <p className="mt-2 pt-2 border-t border-gray-300">
                    <span className="text-gray-600">Validated (original test):</span>{' '}
                    <span className="font-mono font-bold text-green-700">{pythonData.statistics.wspd.validated_value.toFixed(1)}kt</span>
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">GST Error Statistics:</p>
                <div className="text-sm space-y-1">
                  <p><span className="text-gray-600">Mean:</span> <span className="font-mono font-bold">{pythonData.statistics.gst.mean.toFixed(2)}kt</span></p>
                  <p><span className="text-gray-600">Std Dev:</span> <span className="font-mono">±{pythonData.statistics.gst.std_dev.toFixed(2)}kt</span></p>
                  <p><span className="text-gray-600">Range:</span> <span className="font-mono">{pythonData.statistics.gst.min.toFixed(2)} - {pythonData.statistics.gst.max.toFixed(2)}kt</span></p>
                  <p className="mt-2 pt-2 border-t border-gray-300">
                    <span className="text-gray-600">Validated (original test):</span>{' '}
                    <span className="font-mono font-bold text-green-700">{pythonData.statistics.gst.validated_value.toFixed(1)}kt</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comparison: Python vs Production */}
        {pythonData && productionData && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Apple-to-Apple Comparison: Python Mean vs Production
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Comparing mean of Python test runs (green) vs single Production API run (blue).
            </p>

            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparisonChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis
                    domain={[0, 20]}
                    label={{ value: 'Wind Speed (knots)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip />
                  <Legend />

                  {/* Actual data */}
                  <Line type="monotone" dataKey="Actual WSPD" stroke="#000000" strokeWidth={4} dot={{ r: 6 }} name="Actual WSPD" />
                  <Line type="monotone" dataKey="Actual GST" stroke="#666666" strokeWidth={4} dot={{ r: 6 }} strokeDasharray="5 5" name="Actual GST" />

                  {/* Python mean */}
                  <Line type="monotone" dataKey="Python Mean WSPD" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="Python Mean WSPD" />
                  <Line type="monotone" dataKey="Python Mean GST" stroke="#34d399" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="3 3" name="Python Mean GST" />

                  {/* Production */}
                  <Line type="monotone" dataKey="Production WSPD" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="Production WSPD" />
                  <Line type="monotone" dataKey="Production GST" stroke="#60a5fa" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="3 3" name="Production GST" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Comparison Statistics */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-3 gap-6 text-sm">
                <div>
                  <p className="font-semibold text-gray-800 mb-2">Actual (Ground Truth)</p>
                  <p className="text-gray-600">From NOAA measurements</p>
                </div>

                <div>
                  <p className="font-semibold text-green-800 mb-2">Python Test Mean</p>
                  <p className="text-green-700">WSPD: {pythonData.statistics.wspd.mean.toFixed(2)}kt error</p>
                  <p className="text-green-700">GST: {pythonData.statistics.gst.mean.toFixed(2)}kt error</p>
                  <p className="text-xs text-green-600 mt-1">±{pythonData.statistics.wspd.std_dev.toFixed(2)}kt / ±{pythonData.statistics.gst.std_dev.toFixed(2)}kt variance</p>
                </div>

                <div>
                  <p className="font-semibold text-blue-800 mb-2">Production API</p>
                  <p className="text-blue-700">WSPD: {productionData.summary.avgWspdError}kt error</p>
                  <p className="text-blue-700">GST: {productionData.summary.avgGstError}kt error</p>
                  <p className={`text-xs mt-1 font-semibold ${
                    parseFloat(productionData.summary.avgWspdError) >= pythonData.statistics.wspd.mean - 2 * pythonData.statistics.wspd.std_dev &&
                    parseFloat(productionData.summary.avgWspdError) <= pythonData.statistics.wspd.mean + 2 * pythonData.statistics.wspd.std_dev
                      ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {parseFloat(productionData.summary.avgWspdError) >= pythonData.statistics.wspd.mean - 2 * pythonData.statistics.wspd.std_dev &&
                     parseFloat(productionData.summary.avgWspdError) <= pythonData.statistics.wspd.mean + 2 * pythonData.statistics.wspd.std_dev
                      ? '✓ Within expected variance' : '⚠ Outside expected variance'}
                  </p>
                </div>
              </div>
            </div>

            {/* Interpretation */}
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900">
                <strong>Interpretation:</strong> If Production results fall within Python Mean ± 2σ (two standard deviations),
                the differences are due to natural LLM variance, not code issues. Otherwise, investigate potential bugs in production code.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
