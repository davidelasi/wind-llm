'use client';

import React from 'react';
import Navigation from '@/components/Navigation';

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">How It Works</h1>
          <p className="text-gray-700 leading-relaxed mb-4">
              Wind-LA is a new type of wind forecast system for water sports based on Artificial Intelligence (AI), specifically Large Language Models (LLMs). 
              This app uses an LLM to forecast a time series of wind data, based on the latest marine forecast for the area and a historical set of 
              training data (forecasts + actual wind), which are curated and delivered to the model to implement a technique known as Few Shots Learning. 
              This proof-of-concept is presently implemented for a single location, Cabrillo Beach, a popular spot for wingfoiling and windsurfing in the area of 
              Los Angeles that works well on thermal WSW winds that typically develop in the afternoon hours.
            </p>
            <div className="my-6">
              <img
                src="/images/forecast_area_and_spot.png"
                alt="Marine forecast area and location of the spot and the AGXC1 wind sensor."
                className="rounded-lg shadow-md max-w-full md:max-w-sm mx-auto"
                loading="eager"
              />
              <p className="mt-2 text-xs text-gray-500 text-center">
                Source: NOAA. Marine forecast area (green) and location of the spot and the AGXC1 wind sensor (red arrow).
              </p>
            </div>
            <p className="text-gray-700 leading-relaxed mb-4">
              The historic wind data used to train the model are from the
              <a href="https://www.ndbc.noaa.gov/station_page.php?station=AGXC1" target="_blank" rel="noopener noreferrer" className="text-[#005F73] hover:text-[#0A9396] underline font-medium"> NOAA buoy station AGXC1</a>,
              located at Angels Gate, about two miles downwind of the spot. Because the wind at the sensor's location is typically a few knots (3-5) lower than the wind at the spot,
              this forecast tends to underestimate the wind at Cabrillo Beach. So, if the forecast reads 10 knots, you may expect 13-15 knots at the spot. Adjust your expectations accordingly.
            </p>
            <div className="my-6">
              <img
                src="/images/wind_sensors_and_spot.png"
                alt="The red line, about 2 miles long, connects the location of the spot with the location of the AGXC1 wind sensor."
                className="rounded-lg shadow-md max-w-full md:max-w-xl mx-auto"
                loading="eager"
              />
              <p className="mt-2 text-xs text-gray-500 text-center">
                Source: Openseamap.org. The red line connects the location of the spot (left) with the location of the AGXC1 wind sensor (right).
                The dominant direction of the wind is also along the red line, such that the wind station is about 2 miles downwind of the spot.
                Use this only as a decision aid, keep official NWS advisories in view, and trust your own judgment when you're at the beach. The wind always has the final say.
              </p>
            </div>

          {/* Why LLM vs Traditional */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Why a Language Model Instead of Physics?</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              When I started this project, I asked myself: why extract features from forecast text when a language model can read it directly? 
              The NWS forecast is already expert-written and packed with timing cues like "becoming 20 kt in the afternoon" or advisory language that signals stronger winds, fogs, 
              or other weather instabilities that tend to affect local wind patterns. 
              Traditional physics-based models work great at large scales, but for a hyper-local spot like AGXC1, I wanted to see if an LLM could learn the patterns that 
              connect <em>that specific text</em> to <em>this specific location</em>. In other words, this forecasting system leverages correlations between the marine forecasts
              for the area of LA and the specific wind conditions that materialize at the spot. 
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
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Training Data & Few-Shot Learning</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              The model learns from <strong>9 years of historical data</strong> (2016-2024) that pairs NWS forecast text with actual wind measurements from AGXC1.
              Each time a forecast is requested, the system selects <strong>15 curated examples</strong> from a seasonal window—drawing from the current month plus the months immediately before and after.
              This ensures the examples reflect similar seasonal patterns while providing enough variety.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              The examples include a balanced mix of calm, moderate, and strong wind days so the model has seen the full range of conditions.
              This technique is called <em>few-shot learning</em>—the model doesn't need retraining; it learns patterns directly from the examples provided in each prompt.
            </p>
          </section>

          {/* How Predictions Are Generated */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">How Predictions Are Generated</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Once the system has the NWS forecast text and the 15 curated examples, it passes everything to <strong>Claude Sonnet 4</strong> (Anthropic's large language model). 
              The model also receives <strong>geographic context</strong> about AGXC1's location—this helps it correctly interpret NWS sub-area mentions like "Malibu to Santa Monica" versus "San Pedro Channel" and apply the right conditions to our specific location. 
              The model analyzes the forecast text, looks at the patterns in the examples, and outputs hourly wind speed and gusts for the next <strong>five days</strong> (D+0 through D+4).
            </p>
            <p className="text-gray-700 leading-relaxed">
              The model's predictions are cached and only regenerated when the NWS releases a new bulletin (typically four times daily). This keeps costs under control while ensuring the forecast stays aligned with official updates.
            </p>
          </section>       
        </div>
      </div>
    </div>
  );
}
