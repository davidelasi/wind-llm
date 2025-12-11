'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';

/**
 * SimpleFlowDiagram - High-level visual representation of the forecasting system
 * Shows the three main steps: Input → Processing → Output
 * Designed for non-technical users on the "How It Works" page
 */
export default function SimpleFlowDiagram() {
  const boxes = [
    {
      title: 'NWS Forecast Text',
      description: 'Unstructured forecast from National Weather Service',
      example: '"W wind 15 to 25 kt..."',
      color: 'bg-blue-50 border-blue-300',
      textColor: 'text-blue-900',
      icon: '📄'
    },
    {
      title: 'AI Model + Historical Examples',
      description: 'Claude AI learns from 720 past forecasts',
      example: '15 relevant examples',
      color: 'bg-purple-50 border-purple-300',
      textColor: 'text-purple-900',
      icon: '🤖'
    },
    {
      title: 'Hourly Wind Predictions',
      description: '5 days of detailed forecasts',
      example: '11 AM-6 PM daily',
      color: 'bg-green-50 border-green-300',
      textColor: 'text-green-900',
      icon: '💨'
    }
  ];

  return (
    <div className="w-full py-8">
      {/* Desktop Layout: Horizontal */}
      <div className="hidden md:flex md:items-center md:justify-center md:gap-4">
        {boxes.map((box, index) => (
          <React.Fragment key={index}>
            {/* Box */}
            <div className={`flex-1 max-w-xs border-2 rounded-lg p-6 shadow-sm ${box.color}`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{box.icon}</span>
                <h3 className={`font-semibold text-lg ${box.textColor}`}>
                  {box.title}
                </h3>
              </div>
              <p className="text-sm text-gray-700 mb-2">{box.description}</p>
              <p className="text-xs font-mono text-gray-600 italic">{box.example}</p>
            </div>

            {/* Arrow (except after last box) */}
            {index < boxes.length - 1 && (
              <ArrowRight className="text-[#005F73] flex-shrink-0" size={32} strokeWidth={2.5} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Mobile Layout: Vertical */}
      <div className="flex md:hidden flex-col items-center gap-4">
        {boxes.map((box, index) => (
          <React.Fragment key={index}>
            {/* Box */}
            <div className={`w-full border-2 rounded-lg p-6 shadow-sm ${box.color}`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{box.icon}</span>
                <h3 className={`font-semibold text-lg ${box.textColor}`}>
                  {box.title}
                </h3>
              </div>
              <p className="text-sm text-gray-700 mb-2">{box.description}</p>
              <p className="text-xs font-mono text-gray-600 italic">{box.example}</p>
            </div>

            {/* Down Arrow (except after last box) */}
            {index < boxes.length - 1 && (
              <div className="flex justify-center">
                <div className="text-[#005F73] rotate-90">
                  <ArrowRight size={32} strokeWidth={2.5} />
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
