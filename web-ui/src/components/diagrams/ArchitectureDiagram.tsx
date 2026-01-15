'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * ArchitectureDiagram - Detailed technical system architecture
 * Shows all layers: Frontend, API, Cache, External Services
 * Designed for developers on the "Sausage Mode" page
 */
export default function ArchitectureDiagram() {
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set(['all']));

  const toggleLayer = (layer: string) => {
    const newExpanded = new Set(expandedLayers);
    if (newExpanded.has(layer)) {
      newExpanded.delete(layer);
    } else {
      newExpanded.add(layer);
    }
    setExpandedLayers(newExpanded);
  };

  const isExpanded = (layer: string) => expandedLayers.has('all') || expandedLayers.has(layer);

  return (
    <div className="w-full bg-white rounded-lg border border-gray-200 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900">Complete System Architecture</h3>
        <button
          onClick={() => setExpandedLayers(expandedLayers.has('all') ? new Set() : new Set(['all']))}
          className="text-sm text-[#005F73] hover:underline"
        >
          {expandedLayers.has('all') ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      <div className="space-y-4">
        {/* Frontend Layer */}
        <Layer
          title="Frontend Layer"
          bgColor="bg-blue-50"
          borderColor="border-blue-300"
          isExpanded={isExpanded('frontend')}
          onToggle={() => toggleLayer('frontend')}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Component name="Home Page" route="/" />
            <Component name="Sausage Mode" route="/sausage-mode" />
            <Component name="Validation Test" route="/validation-test" />
            <Component name="Debug Page" route="/debug" />
          </div>
        </Layer>

        {/* Arrow */}
        <Arrow />

        {/* API Routes Layer */}
        <Layer
          title="API Routes (13 endpoints)"
          bgColor="bg-purple-50"
          borderColor="border-purple-300"
          isExpanded={isExpanded('api')}
          onToggle={() => toggleLayer('api')}
        >
          <div className="space-y-2">
            <APIEndpoint name="/api/llm-forecast" description="Main LLM predictions" highlight />
            <APIEndpoint name="/api/wind-data" description="Current observations" />
            <APIEndpoint name="/api/wind-history" description="Historical data (unified)" />
            <APIEndpoint name="/api/area-forecast" description="NWS forecast text" />
            <APIEndpoint name="/api/sausage-mode" description="Diagnostics" />
            <APIEndpoint name="/api/validation-*" description="Testing endpoints" />
          </div>
        </Layer>

        {/* Arrow */}
        <Arrow />

        {/* Cache Layer */}
        <Layer
          title="Cache Layer"
          bgColor="bg-yellow-50"
          borderColor="border-yellow-300"
          isExpanded={isExpanded('cache')}
          onToggle={() => toggleLayer('cache')}
        >
          <div className="space-y-2 text-sm">
            <CacheStrategy name="Time-based Cache" ttl="3 hour TTL" />
            <CacheStrategy name="Content-based Cache" ttl="NWS unchanged detection" />
            <CacheStrategy name="File Cache" ttl="/tmp in serverless, .cache local" />
            <CacheStrategy name="ETag support" ttl="HTTP caching" />
          </div>
        </Layer>

        {/* Arrow */}
        <Arrow />

        {/* External Services Layer */}
        <Layer
          title="External Data Sources"
          bgColor="bg-green-50"
          borderColor="border-green-300"
          isExpanded={isExpanded('external')}
          onToggle={() => toggleLayer('external')}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ExternalService name="NOAA Buoy AGXC1" description="6-min wind data" />
            <ExternalService name="NWS API" description="Coastal forecasts" />
            <ExternalService name="Claude API" description="Sonnet 4 model" />
          </div>
        </Layer>
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-600 mb-2 font-medium">Color Legend:</p>
        <div className="flex flex-wrap gap-4 text-xs text-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
            <span>Frontend (User-facing pages)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-purple-100 border border-purple-300 rounded"></div>
            <span>API Layer (Serverless functions)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
            <span>Caching (Performance optimization)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
            <span>External Services (Data sources)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-components

interface LayerProps {
  title: string;
  bgColor: string;
  borderColor: string;
  children: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
}

function Layer({ title, bgColor, borderColor, children, isExpanded, onToggle }: LayerProps) {
  return (
    <div className={`border-2 rounded-lg ${borderColor} ${bgColor}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-white/50 transition-colors"
      >
        <h4 className="font-semibold text-gray-900">{title}</h4>
        {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

function Component({ name, route }: { name: string; route: string }) {
  return (
    <div className="bg-white border border-gray-300 rounded p-3 text-center">
      <div className="font-medium text-gray-900 text-sm">{name}</div>
      <div className="text-xs text-gray-600 font-mono mt-1">{route}</div>
    </div>
  );
}

function APIEndpoint({ name, description, highlight }: { name: string; description: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between p-2 rounded ${highlight ? 'bg-purple-100 border border-purple-400' : 'bg-white border border-gray-300'}`}>
      <code className="text-xs font-mono text-gray-900">{name}</code>
      <span className="text-xs text-gray-600">{description}</span>
    </div>
  );
}

function CacheStrategy({ name, ttl }: { name: string; ttl: string }) {
  return (
    <div className="flex items-center justify-between p-2 bg-white border border-gray-300 rounded">
      <span className="text-xs font-medium text-gray-900">{name}</span>
      <span className="text-xs text-gray-600">{ttl}</span>
    </div>
  );
}

function ExternalService({ name, description }: { name: string; description: string }) {
  return (
    <div className="bg-white border border-gray-300 rounded p-3 text-center">
      <div className="font-medium text-gray-900 text-sm">{name}</div>
      <div className="text-xs text-gray-600 mt-1">{description}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center">
      <div className="text-gray-400">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M12 19l-4-4M12 19l4-4" />
        </svg>
      </div>
    </div>
  );
}
