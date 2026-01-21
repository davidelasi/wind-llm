'use client';

import Navigation from '@/components/Navigation';

export default function FAQ() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* FAQ Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h1>

          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">How accurate are the predictions?</h2>
              <p className="text-gray-700 leading-relaxed">
                Unlike most other wind apps, I intend to publish detailed quantitative information on the accuracy of this forecast. This section of the site is not ready yet, but it's what I am actively working on these days.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Do you have plans to cover other spots besides Cabrillo?</h2>
              <p className="text-gray-700 leading-relaxed">
                I would love to cover Belmont Shore! However, I could not find a public dataset of historic wind data from a sensor sufficiently close to the kitesurfing and wingfoiling spot at Belmont. If such a dataset becomes available, I would definitely add Belmont, which is my favorite kitefoiling spot.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Can I trust this for safety decisions?</h2>
              <p className="text-gray-700 leading-relaxed">
                Short answer: <strong>NO!</strong> Wind-LA is a decision aid, not a replacement for official advisories. Always check the <a href="https://www.weather.gov/lox/" target="_blank" rel="noopener noreferrer" className="text-[#005F73] hover:text-[#0A9396] underline font-medium">National Weather Service</a> for warnings and advisories. No forecast is perfect—use this alongside other sources, your own observations, and your judgment. The wind at Cabrillo Beach is nearly side-shore, with rocks or the open ocean downwind. When in doubt, stay on the beach: it's full of nice people to talk to!
              </p>
            </div>
          </div>
        </div>

        {/* Backlog Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Development Roadmap</h1>

          <p className="text-gray-700 leading-relaxed mb-6">
            Here's what I'm working on to make Wind-LA even better. These features are roughly ordered by priority, but timelines are flexible. If you have feedback or suggestions, feel free to reach out via the <a href="/about" className="text-[#005F73] hover:text-[#0A9396] underline font-medium">About</a> page.
          </p>

          <div className="space-y-6">
            {/* Milestone 1 */}
            <div className="border-l-4 border-[#005F73] pl-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                🎯 Add Area Weather Forecast to the Model
              </h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                <strong>Status:</strong> Data collected, needs cleanup and integration
              </p>
              <p className="text-gray-700 leading-relaxed">
                I would like to improve prediction quality by passing the NWS <em>area weather forecast</em> for Los Angeles to the model alongside the Inner Waters marine forecast. I've already collected all the data but need to go through the pain of cleanup, refactoring, and reworking the application logic to add this to the LLM prompt.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                This will make running the forecast more expensive (more tokens = higher cost), but it should allow the model to make better predictions. For example, we know that heat bubbles (which may be mentioned in the area weather forecast) can interfere with the development of afternoon thermal ocean winds. By adding the area weather forecast to the marine forecast, I believe we'll better satisfy Ashby's law of requisite variety for this problem. Stay tuned for developments in the coming months!
              </p>
            </div>

            {/* Milestone 2 */}
            <div className="border-l-4 border-[#94D2BD] pl-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                🔄 Reinforcement Learning from Prediction Errors
              </h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                <strong>Status:</strong> Concept phase
              </p>
              <p className="text-gray-700 leading-relaxed">
                I believe the system can learn from its own mistakes! Soon, I would like to implement a sort of reinforcement learning by automatically adding new examples to the training set when the model makes large prediction errors. Say today's forecast was exceptionally wrong compared to the actual wind—I want to identify such days automatically and add them to the training set.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                Perhaps today's forecast was an unusual type that rarely occurred in the training data or wasn't included in the curated examples. A mechanism for automatically updating the training examples should ensure that the same "miss" doesn't repeat in the future.
              </p>
            </div>

            {/* Milestone 3 */}
            <div className="border-l-4 border-[#94D2BD] pl-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                🛰️ Multi-Modal Prediction with Satellite Imagery
              </h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                <strong>Status:</strong> Research phase
              </p>
              <p className="text-gray-700 leading-relaxed">
                Yes! I'm planning to integrate freely available satellite data of cloud coverage over the Los Angeles coast for multi-modal prediction. We know that during certain times of year, wind development at the spot hinges on the marine layer disappearing early in the day. This is something we can train a model to recognize by passing both text and images.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                Claude Sonnet 4 already supports vision, so the technical foundation is there. I'm planning to work on this feature after releasing the area weather forecast integration mentioned above.
              </p>
            </div>

            {/* Milestone 4 */}
            <div className="border-l-4 border-gray-300 pl-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                📍 Wind Direction Predictions
              </h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                <strong>Status:</strong> Future consideration
              </p>
              <p className="text-gray-700 leading-relaxed">
                Currently, Wind-LA predicts wind speed and gusts but not direction. Adding direction predictions would help riders decide whether it's side-shore, side-onshore, or cross-shore conditions. The data is available—it's a matter of extending the training examples and output format to include directional information.
              </p>
            </div>

            {/* Milestone 5 */}
            <div className="border-l-4 border-gray-300 pl-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                🌡️ Seasonal & Climate Indicators
              </h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                <strong>Status:</strong> Future consideration
              </p>
              <p className="text-gray-700 leading-relaxed">
                Longer-term climate patterns like El Niño and La Niña can affect wind patterns in Southern California. Integrating these indicators could help the model adjust its expectations during anomalous seasons. This is a longer-term enhancement that would require careful validation.
              </p>
            </div>
          </div>

          {/* Call to Action */}
          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-gray-700 leading-relaxed">
              <strong>Want to contribute or suggest a feature?</strong> I'm open to collaboration and feedback. Reach out through the <a href="/about" className="text-[#005F73] hover:text-[#0A9396] underline font-medium">About</a> page. If you're a data scientist, machine learning engineer, or just a fellow wind enthusiast with ideas, I'd love to hear from you!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
