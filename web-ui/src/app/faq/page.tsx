'use client';

import Navigation from '@/components/Navigation';

export default function FAQ() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* FAQ Section */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h1>
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">What is Wind-LA?</h2>
              <p className="text-gray-600">
                Wind-LA is an LLM-based wind forecasting system specifically designed for ocean sports enthusiasts
                in the Los Angeles area. It uses machine learning to predict wind speeds and gusts based on National
                Weather Service forecasts.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">How accurate are the predictions?</h2>
              <p className="text-gray-600">
                Our system has been validated against historical data with an average error of 1.54 ± 0.19 knots
                for wind speed (WSPD) and 2.02 ± 0.16 knots for gust speed (GST). These results are based on
                testing with temperature 1.0 variance testing.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">What location does this cover?</h2>
              <p className="text-gray-600">
                The forecasts are specific to the AGXC1 buoy station near Los Angeles, which provides real-time
                wind measurements and is ideal for sailors, windsurfers, and other ocean sports participants in
                the LA area.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">How often are forecasts updated?</h2>
              <p className="text-gray-600">
                Forecasts are updated automatically when the National Weather Service issues new coastal forecasts,
                typically three times daily. The system uses intelligent caching to detect when the NWS forecast
                has changed and regenerates predictions accordingly.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">What time range do the forecasts cover?</h2>
              <p className="text-gray-600">
                Forecasts focus on the peak wind hours for ocean sports: 10 AM to 7 PM Pacific Time. This is when
                thermal winds typically develop and are most relevant for sailing, windsurfing, and other activities.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">What technology powers this system?</h2>
              <p className="text-gray-600">
                Wind-LA uses Claude Sonnet 4 (Anthropic's large language model) with few-shot learning. The model
                was trained on 9 years of historical data (2016-2024) combining NWS forecasts with actual wind
                measurements from the AGXC1 buoy. The system uses 720 carefully curated training examples organized
                by month and forecast issuance time.
              </p>
            </div>
          </div>
        </div>

        {/* Backlog Section */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Planned Features & Improvements</h1>

          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-3">Short-Term Roadmap</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-600">
                <li>Add wind direction predictions (currently only speed and gusts)</li>
                <li>Extend forecast horizon from 3 days to 5 days</li>
                <li>Mobile-optimized interface improvements</li>
                <li>Historical forecast accuracy tracking dashboard</li>
                <li>Email/SMS notifications for favorable wind conditions</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-3">Medium-Term Goals</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-600">
                <li>Integration of Area Forecast data alongside Coastal Waters forecasts</li>
                <li>Seasonal/climate indicator integration (El Niño/La Niña patterns)</li>
                <li>Multiple location support (additional buoy stations)</li>
                <li>User-customizable alert thresholds</li>
                <li>Advanced statistics and trend analysis</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-3">Research & Experimentation</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-600">
                <li>Model fine-tuning vs. few-shot learning comparison</li>
                <li>Temperature parameter optimization for variance control</li>
                <li>TOON v2.0 format evaluation for token efficiency</li>
                <li>Ensemble forecasting with multiple model runs</li>
                <li>Integration with other weather data sources</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-3">Community Features</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-600">
                <li>User-submitted actual condition reports</li>
                <li>Spot popularity and crowding indicators</li>
                <li>Equipment recommendations based on forecast</li>
                <li>Community discussion and feedback platform</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Target Production Launch:</strong> January 1, 2026
            </p>
            <p className="text-sm text-blue-700 mt-2">
              Have suggestions or feature requests? Feel free to reach out through the About page!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
