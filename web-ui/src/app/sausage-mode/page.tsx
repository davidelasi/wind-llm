'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, RefreshCw } from 'lucide-react';

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

export default function SausageModePage() {
  const [diagnosticData, setDiagnosticData] = useState<SausageModeData | null>(null);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = async () => {
    setLoading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
    a.download = `sausage-mode-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading diagnostic data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold mb-2">Error Loading Data</h2>
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Sausage Mode</h1>
              <p className="text-gray-600 mt-1">Forecast Generation Diagnostics</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchData}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <RefreshCw size={16} />
                Refresh
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
          <CollapsibleSection title="NWS Data Source" defaultOpen={true}>
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
            title="Training Examples"
            badge={`${diagnosticData.data.trainingData.examplesUsed} examples`}
          >
            <div className="space-y-2">
              <DataRow label="File Path" value={diagnosticData.data.trainingData.filePath} mono />
              <DataRow label="Month" value={diagnosticData.data.trainingData.month.toUpperCase()} />
              <DataRow label="Forecast Number" value={diagnosticData.data.trainingData.forecastNumber} />
              <DataRow label="Total Examples" value={diagnosticData.data.trainingData.totalExamples} />
              <DataRow label="Examples Used" value={diagnosticData.data.trainingData.examplesUsed} />
              <DataRow label="Format" value={diagnosticData.data.trainingData.format} />
            </div>
          </CollapsibleSection>
        )}

        {/* LLM Configuration */}
        {diagnosticData?.data?.llmConfig && (
          <CollapsibleSection title="LLM Configuration">
            <div className="space-y-2">
              <DataRow label="Model" value={diagnosticData.data.llmConfig.model} mono />
              <DataRow label="Max Tokens" value={diagnosticData.data.llmConfig.max_tokens} />
              <DataRow label="Timezone" value={diagnosticData.data.llmConfig.timezone} />
              <DataRow label="API Key Set" value={diagnosticData.data.llmConfig.apiKeySet ? 'Yes' : 'No'} />
              <DataRow
                label="Current Time"
                value={new Date(diagnosticData.data.llmConfig.currentTime).toLocaleString()}
              />
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
          <CollapsibleSection title="Current Predictions" defaultOpen={true}>
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
  );
}
