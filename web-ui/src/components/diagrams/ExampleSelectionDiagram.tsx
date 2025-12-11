'use client';

import React, { useState } from 'react';
import { Clock, Calendar, FileText, ArrowDown } from 'lucide-react';

/**
 * ExampleSelectionDiagram - Visual representation of training example selection
 * Shows how the system chooses which examples to load based on time and month
 * Designed for "How It Works" page with interactive elements
 */
export default function ExampleSelectionDiagram() {
  const [selectedMonth, setSelectedMonth] = useState('jul');
  const [selectedTime, setSelectedTime] = useState('14:30');

  // Determine forecast number based on time
  const getForecastNumber = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;

    if (totalMinutes >= 6 * 60 && totalMinutes < 14 * 60) return 1; // 6 AM - 2 PM
    if (totalMinutes >= 14 * 60 && totalMinutes < 20 * 60) return 2; // 2 PM - 8 PM
    return 3; // 8 PM+
  };

  const forecastNumber = getForecastNumber(selectedTime);
  const filename = `${selectedMonth}_fc${forecastNumber}_examples.json`;

  const months = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
  ];

  const getForecastLabel = (fc: number): string => {
    switch (fc) {
      case 1: return 'FC1: Morning (6 AM - 2 PM)';
      case 2: return 'FC2: Afternoon (2 PM - 8 PM)';
      case 3: return 'FC3: Evening (8 PM+)';
      default: return `FC${fc}`;
    }
  };

  return (
    <div className="w-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200 p-6">
      <h3 className="text-xl font-semibold text-gray-900 mb-6">How Training Examples Are Selected</h3>

      {/* Interactive Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Month Selector */}
        <div className="bg-white rounded-lg p-4 border border-gray-300 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="text-[#005F73]" size={20} />
            <label className="font-medium text-gray-700">Current Month (PST):</label>
          </div>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#005F73] focus:border-transparent"
          >
            {months.map((month) => (
              <option key={month} value={month}>
                {month.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Time Selector */}
        <div className="bg-white rounded-lg p-4 border border-gray-300 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="text-[#005F73]" size={20} />
            <label className="font-medium text-gray-700">Current Time (PST):</label>
          </div>
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#005F73] focus:border-transparent"
          />
        </div>
      </div>

      {/* Selection Flow */}
      <div className="space-y-4">
        {/* Step 1: Month */}
        <StepBox
          number={1}
          title="Select Month"
          value={selectedMonth.toUpperCase()}
          description="Based on current Pacific Time"
        />

        <ArrowDown className="mx-auto text-gray-400" size={24} />

        {/* Step 2: Forecast Number */}
        <StepBox
          number={2}
          title="Determine Forecast Number"
          value={`FC${forecastNumber}`}
          description={getForecastLabel(forecastNumber)}
        />

        <ArrowDown className="mx-auto text-gray-400" size={24} />

        {/* Step 3: Load File */}
        <div className="bg-[#005F73] text-white rounded-lg p-6 shadow-md">
          <div className="flex items-center gap-3 mb-3">
            <FileText size={24} />
            <div className="flex-1">
              <div className="text-sm opacity-90">Step 3: Load Training File</div>
              <code className="text-lg font-mono font-semibold">{filename}</code>
            </div>
          </div>
        </div>

        <ArrowDown className="mx-auto text-gray-400" size={24} />

        {/* Step 4: Use Examples */}
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6">
          <div className="text-center">
            <div className="text-sm font-medium text-green-800 mb-2">Step 4: Use in LLM Prompt</div>
            <div className="text-3xl font-bold text-green-900">15 Examples</div>
            <div className="text-sm text-green-700 mt-2">
              4 calm + 8 moderate + 3 strong wind scenarios
            </div>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Why This Matters</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>Monthly Patterns:</strong> Wind patterns vary by season</li>
          <li>• <strong>Time-of-Day:</strong> Morning forecasts differ from evening ones</li>
          <li>• <strong>Diversity:</strong> 15 examples cover calm, moderate, and strong winds</li>
          <li>• <strong>Relevance:</strong> Examples from same month/time provide best context</li>
        </ul>
      </div>

      {/* Technical Details */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-[#005F73]">
          Show Technical Details
        </summary>
        <div className="mt-3 bg-gray-50 rounded p-4 text-xs font-mono">
          <div className="mb-2"><strong>Total Files:</strong> 48 (12 months × 4 forecast numbers)</div>
          <div className="mb-2"><strong>Total Examples:</strong> 720 curated scenarios</div>
          <div className="mb-2"><strong>Per File:</strong> 15 examples (diversity-filtered)</div>
          <div className="mb-2"><strong>Years Covered:</strong> 2016-2024 (9 years of history)</div>
          <div><strong>Selection Criteria:</strong> Wind strength distribution, year diversity, data completeness</div>
        </div>
      </details>
    </div>
  );
}

// Sub-component

interface StepBoxProps {
  number: number;
  title: string;
  value: string;
  description: string;
}

function StepBox({ number, title, value, description }: StepBoxProps) {
  return (
    <div className="bg-white border-2 border-gray-300 rounded-lg p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-10 h-10 bg-[#005F73] text-white rounded-full flex items-center justify-center font-bold">
          {number}
        </div>
        <div className="flex-1">
          <div className="text-sm text-gray-600">{title}</div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-xs text-gray-500 mt-1">{description}</div>
        </div>
      </div>
    </div>
  );
}
