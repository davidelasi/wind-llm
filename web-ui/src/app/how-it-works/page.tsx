'use client';

import React from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import SimpleFlowDiagram from '@/components/diagrams/SimpleFlowDiagram';
import ExampleSelectionDiagram from '@/components/diagrams/ExampleSelectionDiagram';
import { ExternalLink, Home, Settings } from 'lucide-react';

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">How It Works</h1>
          <p className="text-lg text-gray-700 leading-relaxed">
            Traditional wind forecasting uses complex numerical weather models that require massive computing power.
            This system takes a different approach: it uses an AI language model to learn patterns directly from
            historical forecasts and actual observations. Think of it as teaching the AI to "read" weather forecasts
            the same way an experienced sailor would.
          </p>
        </div>

        {/* High-Level Flow */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">The Big Picture</h2>
          <SimpleFlowDiagram />
        </div>

        {/* The Four-Step Process */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">The Four-Step Process</h2>

          {/* Step 1: Data Collection */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#005F73] text-white rounded-full flex items-center justify-center font-bold text-lg">
                1
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Data Collection</h3>
            </div>
            <p className="text-gray-700 mb-4 ml-13">
              Wind data comes from NOAA buoy station AGXC1 (located near Los Angeles). This buoy measures wind
              conditions every 6 minutes, 24 hours a day. The National Weather Service (NWS) issues coastal
              water forecasts three times daily.
            </p>
            <div className="ml-13 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="text-sm font-semibold text-gray-700 mb-2">Example: Raw NWS Forecast Text</div>
              <pre className="text-xs font-mono text-gray-800 overflow-x-auto">
{`.THU...NW wind 15 to 25 kt, becoming 20 to 30 kt in the afternoon.
Seas 10 to 12 ft. Small Craft Advisory in effect.`}
              </pre>
              <p className="text-xs text-gray-600 mt-2">
                This is the actual text the AI reads—no preprocessing or feature extraction required.
              </p>
            </div>
          </div>

          {/* Step 2: Training Data Preparation */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#005F73] text-white rounded-full flex items-center justify-center font-bold text-lg">
                2
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Training Data Preparation</h3>
            </div>
            <p className="text-gray-700 mb-4 ml-13">
              We've collected 9 years of historical data (2016-2024), carefully curating 720 examples that show
              what NWS forecasted versus what actually happened. Each example includes the forecast text and the
              actual hourly wind measurements.
            </p>
            <div className="ml-13 grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-900">720</div>
                <div className="text-sm text-blue-700">Curated Examples</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-900">9</div>
                <div className="text-sm text-green-700">Years of History</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-purple-900">93.7%</div>
                <div className="text-sm text-purple-700">Data Completeness</div>
              </div>
            </div>
            <div className="ml-13 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="text-sm font-semibold text-gray-700 mb-2">Example: Training Data Structure</div>
              <pre className="text-xs font-mono text-gray-800 overflow-x-auto">
{`{
  "issued": "2023-07-15T08:00:00-08:00",
  "forecast": {
    "d0_day": "W wind 10 kt or less",
    "d0_night": "W wind 10 kt or less"
  },
  "actual": {
    "2023-07-15": {
      "11:00": { "wspd": 8.5, "gst": 11.2 },
      "12:00": { "wspd": 9.1, "gst": 12.4 },
      "13:00": { "wspd": 10.3, "gst": 13.8 }
      // ... hourly data through 6 PM
    }
  }
}`}
              </pre>
              <p className="text-xs text-gray-600 mt-2">
                Each example pairs a forecast with what actually happened, teaching the AI the relationship between predictions and reality.
              </p>
            </div>
          </div>

          {/* Step 3: Few-Shot Learning */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#005F73] text-white rounded-full flex items-center justify-center font-bold text-lg">
                3
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Few-Shot Learning</h3>
            </div>
            <p className="text-gray-700 mb-4 ml-13">
              When you request a forecast, the system selects 15 relevant examples (based on the current month and
              time of day) and includes them in the AI prompt. The AI model (Claude Sonnet 4) reads these examples
              to understand patterns, then applies that knowledge to the current NWS forecast.
            </p>
            <div className="ml-13 mb-4">
              <ExampleSelectionDiagram />
            </div>
            <div className="ml-13 bg-yellow-50 border border-yellow-300 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-900 mb-2">Why 15 Examples?</h4>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>• <strong>4 calm scenarios</strong> (winds &lt; 10 knots): Light wind days</li>
                <li>• <strong>8 moderate scenarios</strong> (winds 10-20 knots): Typical sailing conditions</li>
                <li>• <strong>3 strong scenarios</strong> (winds &gt; 20 knots): High wind warnings</li>
              </ul>
              <p className="text-xs text-yellow-700 mt-2">
                This distribution ensures the AI learns from diverse conditions, not just average days.
              </p>
            </div>
          </div>

          {/* Step 4: Real-Time Delivery */}
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#005F73] text-white rounded-full flex items-center justify-center font-bold text-lg">
                4
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Real-Time Delivery</h3>
            </div>
            <p className="text-gray-700 mb-4 ml-13">
              The AI returns detailed hourly predictions for the next 5 days. The results are cached for 3 hours
              to balance freshness with cost-efficiency. The web interface displays these predictions alongside
              actual observed wind data as it becomes available.
            </p>
            <div className="ml-13 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="text-sm font-semibold text-gray-700 mb-2">Caching Strategy</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-[#005F73] rounded-full mt-1.5"></div>
                  <div>
                    <strong className="text-gray-900">Time-based:</strong>
                    <span className="text-gray-600"> Results cached for 3 hours</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-[#005F73] rounded-full mt-1.5"></div>
                  <div>
                    <strong className="text-gray-900">Smart refresh:</strong>
                    <span className="text-gray-600"> Detects when NWS updates forecast</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Key Design Decisions */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Key Design Decisions</h2>

          {/* Decision 1: Why LLM? */}
          <div className="mb-6 pb-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Why Use an AI Language Model?</h3>
            <p className="text-gray-700 mb-3">
              Traditional machine learning would require extracting "features" from forecast text—converting
              phrases like "becoming 20 kt in afternoon" into numbers. This is complex and error-prone.
            </p>
            <p className="text-gray-700">
              Language models already understand text natively. They can read "Small Craft Advisory" and
              implicitly learn it correlates with stronger winds, without anyone explicitly programming that rule.
            </p>
          </div>

          {/* Decision 2: Time Window */}
          <div className="mb-6 pb-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Why Only 11 AM - 6 PM?</h3>
            <p className="text-gray-700 mb-3">
              This time window captures peak thermal wind development—when land heats up and creates wind patterns
              relevant for ocean sports. It's also when sailors, kite surfers, and windsurfers are most active.
            </p>
            <p className="text-gray-700">
              Focusing on these 9 hours (instead of all 24) reduces noise and improves accuracy for the times that matter most.
            </p>
          </div>

          {/* Decision 3: Gust Maximum */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Why Take the Maximum Gust, Not the Average?</h3>
            <p className="text-gray-700 mb-3">
              When aggregating 6-minute measurements into hourly data, wind speed uses the <em>average</em> but
              gust speed uses the <em>maximum</em> value.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="text-sm font-semibold text-gray-700 mb-2">Code Example: Wind Aggregation</div>
              <pre className="text-xs font-mono text-gray-800 overflow-x-auto">
{`# Hour 3:00-4:00 PM has 10 measurements
measurements = [12.3, 13.1, 12.8, 13.5, 12.9, 13.2, 12.7, 13.0, 12.6, 13.4]

# WSPD: Average (sustained wind)
hourly_wspd = mean(measurements)  # Result: 12.95 kt

# GST: Maximum (peak gust) - critical for safety!
hourly_gust = max([15.2, 16.8, 14.9, 17.1, 15.8, 16.2, 15.5, 16.0, 15.3, 16.5])
# Result: 17.1 kt`}
              </pre>
            </div>
            <p className="text-gray-700 mt-3">
              <strong>Why this matters:</strong> Sailors need to know the worst-case gust they might encounter,
              not the average. A 25-knot gust matters even if it only lasts 30 seconds.
            </p>
          </div>
        </div>

        {/* Accuracy & Validation */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">How Accurate Is It?</h2>
          <p className="text-gray-700 mb-4">
            We've validated the system against actual 2023 wind data with excellent results:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
              <div className="text-sm font-medium text-green-800 mb-2">Wind Speed (WSPD) Accuracy</div>
              <div className="text-4xl font-bold text-green-900">±1.5 kt</div>
              <div className="text-sm text-green-700 mt-1">Average error</div>
            </div>
            <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
              <div className="text-sm font-medium text-blue-800 mb-2">Gust Speed (GST) Accuracy</div>
              <div className="text-4xl font-bold text-blue-900">±2.0 kt</div>
              <div className="text-sm text-blue-700 mt-1">Average error</div>
            </div>
          </div>
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>For comparison:</strong> The official NWS forecast for the same test case had a
              1.5 kt error. The AI-based system is competitive with official forecasts for this specific location.
            </p>
          </div>
        </div>

        {/* Learn More */}
        <div className="bg-gradient-to-r from-[#005F73] to-[#0A9396] rounded-lg shadow-lg p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">Want to Dive Deeper?</h2>
          <p className="mb-6 opacity-90">
            Explore the system in action or see complete technical transparency:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href="/"
              className="flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-lg p-4 transition-colors border border-white/20"
            >
              <Home size={24} />
              <div>
                <div className="font-semibold">View Live Forecasts</div>
                <div className="text-sm opacity-75">See the system in action</div>
              </div>
              <ExternalLink size={16} className="ml-auto opacity-50" />
            </Link>
            <Link
              href="/sausage-mode"
              className="flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-lg p-4 transition-colors border border-white/20"
            >
              <Settings size={24} />
              <div>
                <div className="font-semibold">Sausage Mode</div>
                <div className="text-sm opacity-75">See every technical detail</div>
              </div>
              <ExternalLink size={16} className="ml-auto opacity-50" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
