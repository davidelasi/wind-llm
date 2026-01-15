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
      title: 'NWS Coastal Forecast',
      description: 'Inner Waters text from the latest NWS bulletin',
      example: '"W wind 15 to 25 kt..."',
      color: 'bg-blue-50 border-blue-300',
      textColor: 'text-blue-900',
      icon: '📄'
    },
    {
      title: 'Few-Shot Examples + LLM',
      description: '15 curated examples matched by month and issuance time',
      example: 'Claude Sonnet 4',
      color: 'bg-purple-50 border-purple-300',
      textColor: 'text-purple-900',
      icon: '🤖'
    },
    {
      title: 'Hourly Wind + Gusts',
      description: 'D+0 through D+4 for the peak wind window',
      example: '11 AM-6 PM PT',
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
