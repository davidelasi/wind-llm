'use client';

import Navigation from '@/components/Navigation';
import { BarChart3 } from 'lucide-react';

export default function Statistics() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <BarChart3 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Statistics
          </h1>
          <p className="text-gray-500 mb-6">
            Forecast accuracy statistics coming soon.
          </p>
          <div className="inline-block bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
            <p className="text-sm text-yellow-800">
              This page is under development and only visible on localhost.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
