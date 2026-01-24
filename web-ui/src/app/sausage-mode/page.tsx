'use client';

import React, { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import { ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';

interface SausageData {
  nwsData: {
    issuedTime: string | null;
    forecastUrl: string | null;
  };
  extractedForecast: {
    innerWatersForecast: string | null;
    formattedForecast: string | null;
    warnings: string[];
  };
  trainingData: {
    filePath: string;
    month: string;
    forecastNumber: number;
    totalExamples: number;
    examplesUsed: number;
    allExamples: any[];
  };
  prompt: {
    fullPrompt: string | null;
    promptLength: number;
    promptTokenEstimate: number;
  };
  llmConfig: {
    model: string;
    temperature: number;
    top_p: number;
    max_tokens: number;
  };
}

export default function SausageMode() {
  const [data, setData] = useState<SausageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expandable section states
  const [showForecast, setShowForecast] = useState(false);
  const [showTrainingData, setShowTrainingData] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/sausage-mode');
        const result = await response.json();

        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || 'Failed to fetch data');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Sausage Mode</h1>
          <p className="text-gray-600 mb-6 italic">How the forecast is made</p>

          <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed mb-8">
            <p>
              So you really want to see how the sausage is made? Fair enough! This page shows you exactly what goes into generating
              the wind forecast you see on the home page.
            </p>
            <p className="mt-3">
              Here's the recipe: we take the <strong>latest NWS marine forecast</strong>, mix it with <strong>15 carefully curated
              training examples</strong> from similar weather patterns, and feed everything to <strong>Claude</strong> (an AI model by Anthropic).
              The model looks at how past forecasts translated into actual wind conditions, and uses that knowledge to predict what will happen today.
            </p>
            <p className="mt-3 text-sm text-gray-500">
              Click on any section below to expand it and see the raw ingredients.
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#005F73]" />
              <span className="ml-3 text-gray-600">Fetching the ingredients...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <span className="text-red-800">{error}</span>
              </div>
            </div>
          )}

          {data && (
            <div className="space-y-4">

              {/* Section A: NWS Forecast - Teal */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div
                  className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setShowForecast(!showForecast)}
                >
                  <div className="flex items-center space-x-3">
                    <span className="w-8 h-8 bg-[#E0F2F1] text-[#005F73] rounded-full flex items-center justify-center text-sm font-bold">A</span>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        The Weather Forecast
                      </h3>
                      <p className="text-sm text-gray-500">
                        Latest NWS Inner Waters forecast
                        {data.nwsData.issuedTime && (
                          <span className="ml-2 text-gray-400">
                            (issued {new Date(data.nwsData.issuedTime).toLocaleString('en-US', {
                              timeZone: 'America/Los_Angeles',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })} PST — Forecast #{data.trainingData.forecastNumber})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {showForecast ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>

                {showForecast && (
                  <div className="p-4 border-t border-gray-200 bg-gray-50">
                    {data.extractedForecast.warnings.length > 0 && (
                      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-sm font-medium text-yellow-800">Active Warnings:</p>
                        <ul className="text-sm text-yellow-700 mt-1">
                          {data.extractedForecast.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <pre className="bg-gray-900 text-teal-400 p-4 rounded text-xs overflow-x-auto max-h-96 whitespace-pre-wrap">
                      {data.extractedForecast.innerWatersForecast || 'No forecast available'}
                    </pre>
                  </div>
                )}
              </div>

              {/* Section B: Training Data - Orange */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div
                  className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setShowTrainingData(!showTrainingData)}
                >
                  <div className="flex items-center space-x-3">
                    <span className="w-8 h-8 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-sm font-bold">B</span>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        The Training Examples
                      </h3>
                      <p className="text-sm text-gray-500">
                        {data.trainingData.examplesUsed} examples from {(() => {
                          const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                          const currentIdx = months.findIndex(m => m.toLowerCase() === data.trainingData.month.toLowerCase());
                          const prevIdx = (currentIdx - 1 + 12) % 12;
                          const nextIdx = (currentIdx + 1) % 12;
                          return `${months[prevIdx]}-${months[currentIdx]}-${months[nextIdx]}`;
                        })()}
                        {' '}(Forecast #{data.trainingData.forecastNumber})
                      </p>
                    </div>
                  </div>
                  {showTrainingData ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>

                {showTrainingData && (
                  <div className="p-4 border-t border-gray-200 bg-gray-50">
                    <p className="text-sm text-gray-600 mb-3">
                      These are historical forecast → actual wind pairings that help the model understand
                      how NWS forecasts translate to real conditions at our location.
                    </p>
                    <p className="text-xs text-gray-500 mb-3 font-mono">
                      Source: {data.trainingData.filePath.split('/').slice(-3).join('/')}
                    </p>
                    <pre className="bg-gray-900 text-orange-400 p-4 rounded text-xs overflow-x-auto max-h-96">
                      {JSON.stringify(data.trainingData.allExamples, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Section C: LLM Prompt - Purple */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div
                  className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setShowPrompt(!showPrompt)}
                >
                  <div className="flex items-center space-x-3">
                    <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">C</span>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        The LLM Prompt
                      </h3>
                      <p className="text-sm text-gray-500">
                        ~{data.prompt.promptTokenEstimate.toLocaleString()} tokens
                        ({data.prompt.promptLength.toLocaleString()} characters) →{' '}
                        <span className="font-mono text-xs">{data.llmConfig.model}</span>
                      </p>
                    </div>
                  </div>
                  {showPrompt ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>

                {showPrompt && (
                  <div className="p-4 border-t border-gray-200 bg-gray-50">
                    <p className="text-sm text-gray-600 mb-3">
                      This is the complete prompt sent to Claude. It includes the system instructions,
                      all {data.trainingData.examplesUsed} training examples, and the current NWS forecast.
                    </p>
                    <div className="text-xs text-gray-500 mb-3 font-mono flex flex-wrap gap-4">
                      <span>Model: {data.llmConfig.model}</span>
                      <span>Temperature: {data.llmConfig.temperature}</span>
                      <span>Max tokens: {data.llmConfig.max_tokens}</span>
                    </div>
                    <pre className="bg-gray-900 text-purple-400 p-4 rounded text-xs overflow-x-auto max-h-[600px] whitespace-pre-wrap">
                      {data.prompt.fullPrompt || 'No prompt available'}
                    </pre>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
