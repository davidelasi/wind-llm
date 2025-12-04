'use client';

import { useEffect, useState } from 'react';
import Navigation from '../../components/Navigation';
import { ChevronDown, ChevronRight, RefreshCw, AlertTriangle, CheckCircle, FileText, Database, Cpu, Settings } from 'lucide-react';

interface SausageData {
  nwsData: {
    url: string;
    fetchedAt: string;
    issuedTime: string | null;
    forecastUrl: string | null;
    rawForecast: string | null;
    rawForecastLength: number;
  };
  extractedForecast: {
    innerWatersForecast: string | null;
    extractedLength: number;
    extractionMethod: string;
  };
  trainingData: {
    filePath: string;
    month: string;
    forecastNumber: number;
    totalExamples: number;
    examplesUsed: number;
    sampleExamples: any[];
    allExamples: any[];
  };
  prompt: {
    fullPrompt: string | null;
    promptLength: number;
    promptTokenEstimate: number;
    structure: any;
  };
  llmConfig: {
    model: string;
    max_tokens: number;
    currentTime: string;
    timezone: string;
    apiKeySet: boolean;
  };
  postProcessing: {
    description: string;
    scalingFormula: any;
    directionShift: string;
    codeLocation: string;
  };
}

export default function SausageModePage() {
  const [data, setData] = useState<SausageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    nws: true,
    extracted: false,
    training: false,
    prompt: false,
    config: false,
    postprocessing: true,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/sausage-mode');
      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || 'Failed to fetch diagnostic data');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading diagnostic data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)] p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Error Loading Data</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={fetchData}
              className="bg-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const Section = ({ id, title, icon: Icon, children, status }: {
    id: string;
    title: string;
    icon: any;
    children: React.ReactNode;
    status?: 'success' | 'warning' | 'info';
  }) => {
    const isExpanded = expandedSections[id];
    const statusColors = {
      success: 'bg-green-50 border-green-200',
      warning: 'bg-yellow-50 border-yellow-200',
      info: 'bg-blue-50 border-blue-200',
    };

    return (
      <div className={`bg-white rounded-lg shadow-sm border-2 ${status ? statusColors[status] : 'border-gray-200'} mb-4`}>
        <button
          onClick={() => toggleSection(id)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Icon className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-500" />
          )}
        </button>

        {isExpanded && (
          <div className="px-6 pb-6 border-t border-gray-200">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />

      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">🌭 Sausage Mode</h1>
              <p className="text-gray-600">
                See how the forecast is made - every input, every step, every decision
              </p>
            </div>
            <button
              onClick={fetchData}
              className="p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Section 1: NWS Data */}
        <Section id="nws" title="Step 1: NWS Forecast Data" icon={FileText} status="info">
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Source URL</p>
                <a
                  href={data.nwsData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline break-all"
                >
                  {data.nwsData.url}
                </a>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Issued Time</p>
                <p className="text-sm font-mono">
                  {data.nwsData.issuedTime ? new Date(data.nwsData.issuedTime).toLocaleString() : 'N/A'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Raw Forecast ({data.nwsData.rawForecastLength} characters)</p>
              <pre className="bg-gray-50 p-4 rounded text-xs overflow-auto max-h-96 border border-gray-200">
                {data.nwsData.rawForecast || 'No data'}
              </pre>
            </div>
          </div>
        </Section>

        {/* Section 2: Extracted Forecast */}
        <Section id="extracted" title="Step 2: Extracted Inner Waters Forecast" icon={FileText} status="info">
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Extraction Method</p>
                <p className="text-sm font-mono">{data.extractedForecast.extractionMethod}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Extracted Length</p>
                <p className="text-sm font-mono">{data.extractedForecast.extractedLength} characters</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Extracted Text (This goes to the LLM)</p>
              <pre className="bg-blue-50 p-4 rounded text-xs overflow-auto max-h-64 border border-blue-200 font-mono">
                {data.extractedForecast.innerWatersForecast || 'No data extracted'}
              </pre>
            </div>
          </div>
        </Section>

        {/* Section 3: Training Data */}
        <Section id="training" title="Step 3: Training Examples (Few-Shot Learning)" icon={Database}>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Month / Forecast Number</p>
                <p className="text-sm font-mono">{data.trainingData.month.toUpperCase()} FC{data.trainingData.forecastNumber}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Examples Available</p>
                <p className="text-sm font-mono">{data.trainingData.totalExamples}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Examples Used</p>
                <p className="text-sm font-mono">{data.trainingData.examplesUsed}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Training File</p>
              <p className="text-xs font-mono text-gray-500 break-all">{data.trainingData.filePath}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Sample Examples (showing first 3)</p>
              <div className="space-y-3">
                {data.trainingData.sampleExamples.map((example, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200">
                    <p className="text-xs font-semibold text-gray-700 mb-1">Example {idx + 1}:</p>
                    <p className="text-xs text-blue-600 mb-2">Forecast: &quot;{example.forecastText}&quot;</p>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      {example.actualWinds.map((wind: any, i: number) => (
                        <div key={i} className="bg-white p-2 rounded">
                          <p className="font-mono text-gray-600">{wind.hour}</p>
                          <p className="text-gray-800">W: {wind.wspd}kt</p>
                          <p className="text-gray-800">G: {wind.gst}kt</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-blue-600 hover:underline">
                Show All {data.trainingData.totalExamples} Examples (Click to expand)
              </summary>
              <div className="mt-4 space-y-2 max-h-96 overflow-auto">
                {data.trainingData.allExamples.map((example: any, idx: number) => (
                  <div key={idx} className="bg-gray-50 p-2 rounded border border-gray-200 text-xs">
                    <p className="font-semibold mb-1">Example {idx + 1}: {example.forecast.day_0_day}</p>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </Section>

        {/* Section 4: The Prompt */}
        <Section id="prompt" title="Step 4: The Full Prompt Sent to Claude" icon={FileText} status="info">
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Prompt Length</p>
                <p className="text-sm font-mono">{data.prompt.promptLength.toLocaleString()} characters</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Estimated Tokens</p>
                <p className="text-sm font-mono">~{data.prompt.promptTokenEstimate.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Model</p>
                <p className="text-sm font-mono">{data.llmConfig.model}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Full Prompt (Exact text sent to LLM)</p>
              <pre className="bg-purple-50 p-4 rounded text-xs overflow-auto max-h-96 border border-purple-200 font-mono whitespace-pre-wrap">
                {data.prompt.fullPrompt || 'No prompt generated'}
              </pre>
            </div>
          </div>
        </Section>

        {/* Section 5: LLM Configuration */}
        <Section id="config" title="Step 5: LLM Configuration" icon={Settings}>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Model</p>
                <p className="text-sm font-mono">{data.llmConfig.model}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Max Tokens</p>
                <p className="text-sm font-mono">{data.llmConfig.max_tokens}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Timezone</p>
                <p className="text-sm font-mono">{data.llmConfig.timezone}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">API Key Status</p>
                <p className="text-sm font-mono flex items-center">
                  {data.llmConfig.apiKeySet ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                      Set
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-red-600 mr-1" />
                      Not Set
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* Section 6: Post-Processing */}
        <Section id="postprocessing" title="Step 6: Post-Processing (The Problem!)" icon={Cpu} status="warning">
          <div className="space-y-4 mt-4">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mr-3 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-yellow-800">Known Issue</p>
                  <p className="text-sm text-yellow-700 mt-1">{data.postProcessing.description}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Scaling Formula by Day</p>
              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                {Object.entries(data.postProcessing.scalingFormula).map(([day, formula]) => (
                  <div key={day} className="flex justify-between py-1 border-b border-gray-200 last:border-0">
                    <span className="text-sm font-mono text-gray-700">{day}:</span>
                    <span className="text-sm font-mono text-gray-900">{formula as string}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Wind Direction Shift</p>
              <p className="text-sm font-mono bg-gray-50 p-2 rounded border border-gray-200">
                {data.postProcessing.directionShift}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Code Location</p>
              <p className="text-xs font-mono bg-gray-50 p-2 rounded border border-gray-200">
                {data.postProcessing.codeLocation}
              </p>
            </div>
          </div>
        </Section>

        {/* Footer Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> This page shows the complete data pipeline for forecast generation.
            Use this to understand and debug the forecasting system. The warning in Step 6 shows the
            current limitation where only Day 0 is truly predicted by the LLM, and Days 1-4 are artificially scaled.
          </p>
        </div>
      </div>
    </div>
  );
}
