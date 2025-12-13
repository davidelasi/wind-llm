'use client';

import { useMemo, useState } from 'react';
import Navigation from '@/components/Navigation';
import { RefreshCw } from 'lucide-react';

const SATELLITE_BASE = 'https://cdn.star.nesdis.noaa.gov/WFO/lox/GEOCOLOR/';
const SATELLITE_IMAGE = 'latest.jpg';
const WEBCAM_URL = 'https://images-webcams.windy.com/21/1621197821/current/full/1621197821.jpg';

export default function SatCam() {
  // Cache buster toggles to force fresh fetches from both sources
  const [cacheKey, setCacheKey] = useState(() => Date.now());
  const refreshImages = () => setCacheKey(Date.now());

  const satelliteSrc = useMemo(
    () => `${SATELLITE_BASE}${SATELLITE_IMAGE}?t=${cacheKey}`,
    [cacheKey]
  );

  const webcamSrc = useMemo(
    () => `${WEBCAM_URL}?t=${cacheKey}`,
    [cacheKey]
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sat &amp; Cam</h1>
            <p className="text-gray-600">
              Latest satellite and nearby webcam views (auto cache-busted).
            </p>
          </div>
          <button
            onClick={refreshImages}
            className="inline-flex items-center gap-2 bg-[#005F73] text-white px-4 py-2 rounded-lg shadow-sm hover:bg-[#0A9396] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh images
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Satellite (LA region)</h2>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">600x600</span>
            </div>
            <div className="bg-black rounded-lg overflow-hidden flex-1 flex items-center justify-center">
              <img
                src={satelliteSrc}
                alt="Latest satellite view over Los Angeles area"
                className="w-full h-full object-contain bg-black"
                width={600}
                height={600}
                loading="eager"
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Source: NOAA NESDIS GEOCOLOR (WFO LOX).
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Harbor Webcam</h2>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Live</span>
            </div>
            <div className="bg-black rounded-lg overflow-hidden flex-1 flex items-center justify-center">
              <img
                src={webcamSrc}
                alt="Latest harbor webcam image"
                className="w-full h-full object-contain bg-black"
                width={600}
                height={600}
                loading="eager"
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Source: Windy.com webcam feed (no caching).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
