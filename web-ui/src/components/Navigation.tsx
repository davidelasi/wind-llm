'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wind, BarChart3, Home, Menu, X, Navigation as NavigationIcon, AlertTriangle, Bug, Eye, FlaskConical } from 'lucide-react';
import { useState, useEffect } from 'react';

interface NavigationProps {
  className?: string;
}

interface WindData {
  windSpeed?: number;
  gustSpeed?: number;
  windDirection?: number;
  isOld?: boolean;
  ageMinutes?: number;
}

// Custom hook for wind data using NOAA API observations
function useWindData() {
  const [windData, setWindData] = useState<WindData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWindData = async () => {
      try {
        // Use NOAA observations API (same as Debug page)
        const response = await fetch('/api/noaa-observations');
        const result = await response.json();

        if (result.success && result.data) {
          setWindData({
            windSpeed: result.data.windSpeed || undefined,
            gustSpeed: result.data.windGust || undefined,
            windDirection: result.data.windDirection || undefined,
            isOld: result.dataAge?.isOld || false,
            ageMinutes: result.dataAge?.minutes || undefined,
          });
        } else {
          console.error('NOAA observations API failed:', result.message || 'Unknown error');
        }
      } catch (error) {
        console.error('Error fetching wind data from NOAA API:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWindData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchWindData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { windData, loading };
}

// Wind direction arrow component (using same polygon as forecast plot)
const WindDirectionArrow = ({ direction, size = 16 }: { direction: number; size?: number }) => (
  <div
    className="inline-flex items-center justify-center"
    style={{ transform: `rotate(${direction + 180}deg)` }}
    title={`${direction}°`}
  >
    <svg width={size} height={size} viewBox="-8 -12 16 20">
      <polygon
        points="0,-12 -6,6 0,2 6,6"
        fill="#374151"
        stroke="white"
        strokeWidth="1"
      />
    </svg>
  </div>
);

// Helper function to format age display
const formatDataAge = (ageMinutes: number): string => {
  if (ageMinutes < 60) {
    return `${ageMinutes}min ago`;
  } else {
    const hours = Math.floor(ageMinutes / 60);
    return `${hours}h ago`;
  }
};

// Compact wind display component
const CompactWindDisplay = ({ windData, loading }: { windData: WindData; loading: boolean }) => {
  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent"></div>
        <span className="text-xs text-gray-600">Loading...</span>
      </div>
    );
  }

  const hasData = windData.windSpeed !== undefined || windData.windDirection !== undefined;
  if (!hasData) {
    return (
      <div className="flex items-center space-x-1">
        <Wind size={16} className="text-gray-400" />
        <span className="text-xs text-gray-500">No data</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      {/* Wind Speed & Gust - Debug page format */}
      {windData.windSpeed !== undefined && (
        <div className="text-center">
          <div className="text-lg font-bold text-gray-800">
            {Math.round(windData.windSpeed)}
            {windData.gustSpeed && windData.gustSpeed > windData.windSpeed && (
              <span className="text-red-600">/{Math.round(windData.gustSpeed)}</span>
            )}
            <span className="text-sm text-gray-600 ml-1">kt</span>
          </div>
          <div className="text-xs text-gray-600">Wind</div>
        </div>
      )}

      {/* Direction Arrow - Debug page style (Hidden on very small screens) */}
      {windData.windDirection !== undefined && (
        <div className="hidden min-[400px]:flex items-center justify-center">
          <WindDirectionArrow direction={windData.windDirection} size={28} />
        </div>
      )}

      {/* Warning for old data */}
      {windData.isOld && windData.ageMinutes !== undefined && (
        <div className="flex items-center space-x-1">
          <AlertTriangle size={18} className="text-orange-500" />
          <span className="text-sm text-orange-600 hidden min-[500px]:inline">
            {formatDataAge(windData.ageMinutes)}
          </span>
        </div>
      )}
    </div>
  );
};

export default function Navigation({ className = '' }: NavigationProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { windData, loading } = useWindData();

  const navigation = [
    {
      name: 'Home',
      href: '/',
      icon: Home,
      description: 'Current conditions & forecasts'
    },
    {
      name: 'Sausage Mode',
      href: '/sausage-mode',
      icon: Eye,
      description: 'See how forecasts are made'
    },
    {
      name: 'Validation',
      href: '/validation-test',
      icon: FlaskConical,
      description: '2023-07-15 test accuracy check'
    },
    {
      name: 'Debug',
      href: '/debug',
      icon: Bug,
      description: 'Technical information & diagnostics'
    }
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile Navigation */}
      <div className={`lg:hidden ${className}`}>
        <nav className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo/Brand */}
              <Link href="/" className="flex items-center space-x-2">
                <Wind className="h-8 w-8 text-purple-600" />
                <span className="text-xl font-bold text-gray-900">Cabrillo Wind</span>
              </Link>

              {/* Center - Compact Wind Display */}
              <div className="flex-1 flex justify-center">
                <CompactWindDisplay windData={windData} loading={loading} />
              </div>

              {/* Mobile menu button */}
              <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-inset min-w-[44px] min-h-[44px]"
                  aria-label="Toggle menu"
              >
                {isMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile menu overlay */}
          {isMenuOpen && (
            <div className="absolute top-16 left-0 right-0 bg-white border-b border-gray-200 shadow-lg z-50">
              <div className="px-4 py-3 space-y-1">
                {navigation.map((item) => {
                  const IconComponent = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setIsMenuOpen(false)}
                      className={`flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium transition-colors min-h-[44px] ${
                        isActive(item.href)
                          ? 'bg-purple-100 text-purple-700 border border-purple-200'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <IconComponent className="h-5 w-5" />
                      <div>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.description}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </nav>
      </div>

      {/* Desktop Navigation */}
      <div className={`hidden lg:block ${className}`}>
        <nav className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo/Brand */}
              <Link href="/" className="flex items-center space-x-2">
                <Wind className="h-8 w-8 text-purple-600" />
                <span className="text-xl font-bold text-gray-900">Cabrillo Wind Forecast</span>
              </Link>

              {/* Center - Compact Wind Display */}
              <div className="flex-1 flex justify-center">
                <CompactWindDisplay windData={windData} loading={loading} />
              </div>

              {/* Desktop navigation links */}
              <div className="flex space-x-1">
                {navigation.map((item) => {
                  const IconComponent = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                        isActive(item.href)
                          ? 'bg-purple-100 text-purple-700 border border-purple-200'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <IconComponent className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </nav>
      </div>
    </>
  );
}
