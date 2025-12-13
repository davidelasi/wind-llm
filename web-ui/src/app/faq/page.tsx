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
                Wind-LA is an AI-based wind forecasting system specifically designed for ocean sports enthusiasts
                in the Los Angeles area. It uses Large Language Models (LLMs) to predict wind speeds and gusts based on National
                Weather Service forecasts.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">How accurate are the predictions?</h2>
              <p className="text-gray-600">
                Unlike most other wind app, we publish the accuracy of our forecast. Consult the page Statistics for detail. 
                Note however that our forecast and real-time wind data are relative to a sensor located about a mile 
                downwind of the spot. The wind there is typically about 3 knots lower than the wind at the spot. So,
                our forecast generally underestimate the conditions at the spot. Adjust your expectations accordingly.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Do you have plans to cover other spots besides Cabrillo?</h2>
              <p className="text-gray-600">
                I would love to cover Belmont Shore. However, I could not find a public set of historic wind data from a sensor 
                sufficiently close to the kitesurfing and wingfoiling spot at Belmont. If such a data set would be available,
                I would definitely like to include Belmont, which is my favorite kitefoiling spot! 
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
            {/* Backlog Section */}
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h1>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">What's the next major milestone for this project?</h2>
              <p className="text-gray-600">
                I would like to improve the quality of the predictions by passing to the model not only the NWS inner water 
                forecast but also the NWS weather forecast for the Los Angeles area. I have already collected all the data but
                need to go through the pain of data cleanup, refactoring, etc., then reworking the application logic to add
                this additional data to the LLM prompt. This will also make running this forecast more expensive, as the number
                of tokens passed to the LLM model will go up. However, this should allow to make better predictions. For example,
                we know heat bubbles (which may be mentioned in the weather forecast for the Los Angeles area) may interfere with
                the development of afternoon's thermal ocean winds. So, by adding the area weather forecast to the marine forecast
                we hope to improve the quality of our predictions (I believe goes in the direction of better satisfying Ashby's 
                law of requisite variety for the problem at hand). Stay tuned for developments in the coming months!
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Can this system learn from its own mistakes?</h2>
              <p className="text-gray-600">
                I believe so! Soon, I would like to implement a sort of reinforcement learning by adding to the learning data
                set new examples when the model largely misses a daily prediction. Say, today's forecast was exceptionally wrong
                vs the actual wind for the day, I want to identify such days when the model was very wrong automatically and add 
                them to the training set. Perhaps today's forecast was an unutual type of forecast, which rarely occurred in 
                the training data or was not included in the curated set of examples. A mechanism for automatically updating the 
                training examples should ensure that the same "miss" is not repeated in the future. 
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Are there data of other nature that can be used to improve 
                the predictions?
              </h2>
              <p className="text-gray-600">
                Yes! For example, I am planning to consider integrating freely available satellite data of the cloud coverage of
                the Los Angeles coast for a multi-modal prediction. We know that there are periods of the year when the development
                of wind at the spot hinges upon the disappearance of the marine layer early on in the day. And this is something that
                we can train a model to recognize by passing both text and images to the model. I am planning to work on this feature
                after releasing the other two features mentioned above.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
