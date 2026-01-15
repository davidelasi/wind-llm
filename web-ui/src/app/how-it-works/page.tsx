'use client';

import React from 'react';
import Navigation from '@/components/Navigation';
import SimpleFlowDiagram from '@/components/diagrams/SimpleFlowDiagram';
import ExampleSelectionDiagram from '@/components/diagrams/ExampleSelectionDiagram';

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">How It Works</h1>

          {/* Overview */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">What Wind-LA Does</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Wind-LA is a focused forecast for a specific place and a specific time window. It takes the latest
              National Weather Service coastal bulletin for Los Angeles, extracts the Inner Waters section, and turns
              that text into an hourly wind and gust outlook for AGXC1. The forecast centers on the <strong>11 AM-6 PM window</strong> because that is when thermal winds typically build and when most sailors, kiteboarders, and windsurfers
              are on the water.
            </p>
            <p className="text-gray-700 leading-relaxed">
              The readings and predictions are tied to <a href="https://www.ndbc.noaa.gov/station_page.php?station=AGXC1" target="_blank" rel="noopener noreferrer" className="text-[#005F73] hover:text-[#0A9396] underline font-medium">NOAA buoy station AGXC1</a>, located about a mile downwind of the
              Cabrillo launch. In practice, the wind at the launch is usually around <strong>3 knots stronger</strong> than the buoy.
              Treat the numbers on this site as a conservative baseline and adjust upward in your head when you plan
              a session.
            </p>
          </section>

          {/* The Flow */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">The System Flow</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              Here's how a forecast gets generated, from NWS text to hourly predictions:
            </p>
            <SimpleFlowDiagram />
          </section>

          {/* Why LLM vs Traditional */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Why a Language Model Instead of Physics?</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              When I started this project, I asked myself: why extract features from forecast text when a language model can read it directly? The NWS forecast is already expert-written and packed with timing cues like "becoming 20 kt in the afternoon" or advisory language that signals stronger winds. Traditional physics-based models work great at large scales, but for a hyper-local spot like AGXC1, I wanted to see if an LLM could learn the patterns that connect <em>that specific text</em> to <em>this specific location</em>.
            </p>

            {/* Comparison Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-sm md:text-base">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-800">Approach</th>
                    <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-800">Traditional Physics Models</th>
                    <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-800">LLM-Based (Wind-LA)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-medium text-gray-700">Input</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600">Atmospheric pressure, temperature, terrain data</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600">NWS forecast text + historical examples</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-medium text-gray-700">Scale</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600">Regional (grids, large areas)</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600">Hyper-local (single buoy station)</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-medium text-gray-700">Training</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600">Physics equations, numerical solvers</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600">9 years of historical data (2016-2024)</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-medium text-gray-700">Strengths</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600">Broad coverage, explainable physics</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600">Captures local patterns, learns from text</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 font-medium text-gray-700">Limitations</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600">Struggles with micro-scale features</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600">Limited to one location, requires training data</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Training Data */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Training Data & Example Selection</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              The model learns from <strong>9 years of historical data</strong> (2016-2024) that pairs NWS forecast text with actual wind measurements from AGXC1. But instead of using all of that data at once, I curated <strong>720 training examples</strong> organized by month and forecast issuance time. This means the model gets context-specific examples that match the current conditions—July afternoon forecasts get July afternoon examples, December morning forecasts get December morning examples, and so on.
            </p>
            <p className="text-gray-700 leading-relaxed mb-6">
              Each time a forecast is requested, the system loads <strong>15 carefully selected examples</strong> from the matching file. These examples include a mix of calm, moderate, and strong wind days to ensure the model has seen a variety of patterns. This is called <em>few-shot learning</em>—the model doesn't need to be retrained for each forecast, it just learns from the examples it's shown.
            </p>
            <ExampleSelectionDiagram />
          </section>

          {/* How Predictions Are Generated */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">How Predictions Are Generated</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Once the system has the NWS forecast text and the 15 curated examples, it passes everything to <strong>Claude Sonnet 4</strong> (Anthropic's large language model). The model also receives <strong>geographic context</strong> about AGXC1's location—this helps it correctly interpret NWS sub-area mentions like "Malibu to Santa Monica" versus "San Pedro Channel" and apply the right conditions to our specific location. The model analyzes the forecast text, looks at the patterns in the examples, and outputs hourly wind speed and gusts for the next <strong>five days</strong> (D+0 through D+4).
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              Gusts are treated as <strong>hourly maximums</strong> rather than averages. Why? Because short spikes are what riders feel and what matter most for safety. A forecast that says "gusts to 25 kt" means you should expect that peak to happen at some point during the hour, even if the average gust is lower.
            </p>
            <p className="text-gray-700 leading-relaxed">
              The model's predictions are cached and only regenerated when the NWS releases a new bulletin (typically three times daily). This keeps costs under control while ensuring the forecast stays aligned with official updates.
            </p>
          </section>

          {/* Accuracy & Validation */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Accuracy & Validation</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              I validated the system on historical 2023 data for AGXC1 and found strong accuracy (details available on the <a href="/statistics" className="text-[#005F73] hover:text-[#0A9396] underline font-medium">Statistics</a> page). But no forecast is perfect. The model can miss unusual weather patterns, especially if they weren't well-represented in the training data. And remember, the buoy sits slightly downwind of the launch, so actual conditions at Cabrillo are typically a few knots stronger.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Use this as a decision aid, keep official NWS advisories in view, and trust your own judgment when you're at the beach. The wind always has the final say.
            </p>
          </section>

          {/* Technical Details */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Technical Details</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li><strong>Model:</strong> Claude Sonnet 4 (Anthropic)</li>
              <li><strong>Training data:</strong> 2016-2024 NWS forecasts + AGXC1 buoy observations</li>
              <li><strong>Curated examples:</strong> 720 examples across 48 files (12 months × 4 forecast times)</li>
              <li><strong>Few-shot learning:</strong> 15 examples per forecast request</li>
              <li><strong>Forecast horizon:</strong> 5 days (D+0 through D+4)</li>
              <li><strong>Time window:</strong> 11 AM - 6 PM Pacific Time</li>
              <li><strong>Update frequency:</strong> Automatically when NWS issues new bulletins (~3x daily)</li>
              <li><strong>Caching:</strong> Intelligent cache that detects NWS forecast changes</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
