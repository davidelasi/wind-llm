'use client';

import Navigation from '@/components/Navigation';

export default function About() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">About Me</h1>
          <p className="text-gray-600">
            Information about the creator coming soon...
          </p>
        </div>
      </div>
    </div>
  );
}
