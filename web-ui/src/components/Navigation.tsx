'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Home, Menu, X, Eye, HelpCircle, User, Info } from 'lucide-react';
import { useState, useEffect } from 'react';
import appConfig from '@/config/app-config.json';
import { useWindData } from '@/hooks/useWindData';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { PACIFIC_TIMEZONE } from '@/lib/timezone-utils';

interface NavigationProps {
  className?: string;
}

interface NavWindData {
  windSpeed?: number;
  windDirection?: number;
  ageMinutes?: number;
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

// Compact wind display component
const CompactWindDisplay = ({ windData, isMobile = false }: { windData: NavWindData | null; isMobile?: boolean }) => {
  // Don't show anything if data is missing
  if (!windData || windData.windSpeed === undefined || windData.windDirection === undefined) {
    return null;
  }

  // Check age limit (only apply if config is false)
  const isTooOld = !appConfig.navigation.showOldWindData &&
                   windData.ageMinutes !== undefined &&
                   windData.ageMinutes > 60;

  if (isTooOld) {
    return null;
  }

  return (
    <div className="flex flex-col items-center">
      {/* Wind Speed & Direction */}
      <div className="flex items-center space-x-2">
        <span className="text-lg font-bold text-gray-800">
          {Math.round(windData.windSpeed)}
          <span className="text-sm text-gray-600 ml-1">kt</span>
        </span>
        <WindDirectionArrow direction={windData.windDirection} size={24} />
      </div>

      {/* Age info below */}
      <div className="text-xs text-gray-500">
        {windData.ageMinutes !== undefined && `Angels Gate; ${windData.ageMinutes} min ago`}
      </div>
    </div>
  );
};

export default function Navigation({ className = '' }: NavigationProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Use the unified wind data hook (6-minute granularity for latest reading)
  const { data: windHistoryData } = useWindData({
    autoRefresh: true,
    refreshInterval: 5 * 60 * 1000,
    granularity: '6min'
  });

  // Extract the latest wind reading from today's data
  const getLatestWindReading = (): NavWindData | null => {
    if (!windHistoryData || windHistoryData.length === 0) {
      return null;
    }

    // Get today's date in Pacific timezone
    const now = new Date();
    const nowPacific = toZonedTime(now, PACIFIC_TIMEZONE);
    const todayKey = formatInTimeZone(nowPacific, PACIFIC_TIMEZONE, 'yyyy-MM-dd');

    // Find today's data
    const todayData = windHistoryData.find(day => day.date === todayKey);
    if (!todayData || !todayData.hourlyData || todayData.hourlyData.length === 0) {
      return null;
    }

    // Get the most recent data point (last item in array)
    const latestPoint = todayData.hourlyData[todayData.hourlyData.length - 1];

    // Validate we have the required data
    if (latestPoint.windSpeed === null || latestPoint.windSpeed === undefined ||
        latestPoint.windDirection === null || latestPoint.windDirection === undefined) {
      return null;
    }

    // Calculate age in minutes using the timestamp field
    const dataTime = new Date(latestPoint.timestamp);
    const ageMinutes = Math.floor((now.getTime() - dataTime.getTime()) / (1000 * 60));

    return {
      windSpeed: latestPoint.windSpeed,
      windDirection: latestPoint.windDirection,
      ageMinutes
    };
  };

  const windData = getLatestWindReading();

  // Check if we're on localhost - use state to avoid hydration mismatch
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    setIsLocalhost(
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    );
  }, []);

  // Determine if statistics should be visible
  const showStatistics = (appConfig as any).statistics?.enabled ||
    ((appConfig as any).statistics?.showOnLocalhost && isLocalhost);

  const allNavigation = [
    {
      name: 'Home',
      href: '/',
      icon: Home,
      description: 'Current conditions & forecasts'
    },
    {
      name: 'Sat & Cam',
      href: '/sat-cam',
      icon: Eye,
      description: 'Latest satellite + harbor webcam'
    },
    {
      name: 'Statistics',
      href: '/statistics',
      icon: BarChart3,
      description: 'Forecast accuracy & performance',
      hidden: !showStatistics
    },
    {
      name: 'How It Works',
      href: '/how-it-works',
      icon: Info,
      description: 'Learn about our forecasting system'
    },
    {
      name: 'FAQ & Backlog',
      href: '/faq',
      icon: HelpCircle,
      description: 'Questions & planned features'
    },
    {
      name: 'About',
      href: '/about',
      icon: User,
      description: 'About this project'
    }
  ];

  const navigation = allNavigation.filter(item => !(item as any).hidden);

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile Navigation */}
      <div className={`xl:hidden sticky top-0 z-40 ${className}`}>
        <nav className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo/Brand - hide text on mobile to give space to wind display */}
              <Link href="/" className="flex items-center space-x-2 flex-shrink-0">
                <img src="/images/logo.png" alt="Wind-LA Logo" className="h-10 w-10 rounded-lg" />
                <span className="text-xl font-bold text-gray-900 hidden sm:inline">Wind-LA</span>
              </Link>

              {/* Center - Compact Wind Display (no label on mobile) */}
              <div className="flex-1 flex justify-center px-2">
                <CompactWindDisplay windData={windData} isMobile={true} />
              </div>

              {/* Mobile menu button */}
              <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#005F73] focus:ring-inset min-w-[44px] min-h-[44px] flex-shrink-0"
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
                          ? 'bg-[#E0F2F1] text-[#005F73] border border-[#94D2BD]'
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
      <div className={`hidden xl:block sticky top-0 z-40 ${className}`}>
        <nav className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo/Brand */}
              <Link href="/" className="flex items-center space-x-2">
                <img src="/images/logo.png" alt="Wind-LA Logo" className="h-10 w-10 rounded-lg" />
                <span className="text-xl font-bold text-gray-900">Wind-LA</span>
              </Link>

              {/* Center - Compact Wind Display */}
              <div className="flex-1 flex justify-center">
                <CompactWindDisplay windData={windData} />
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
                          ? 'bg-[#E0F2F1] text-[#005F73] border border-[#94D2BD]'
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
