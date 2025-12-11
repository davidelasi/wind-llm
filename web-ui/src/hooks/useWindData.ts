/**
 * React Hook for Wind Data Management
 *
 * Provides unified access to wind history data with automatic refresh,
 * caching, and helper methods for accessing specific day/hour data.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type { WindHistoryResponse, DayData, WindDataPoint } from '@/types/wind-data';
import { findDayByDate } from '@/lib/wind-utils';

interface UseWindDataOptions {
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds
  granularity?: 'hourly' | '6min'; // NEW: Controls data granularity
}

interface UseWindDataReturn {
  data: DayData[] | null;
  metadata: WindHistoryResponse['metadata'] | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getDayByDate: (dateKey: string) => DayData | undefined;
  getLatestDay: () => DayData | undefined;
}

const DEFAULT_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Hook for fetching and managing wind history data
 *
 * @param options - Configuration options
 * @returns Wind data state and helper methods
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { data, isLoading, error, getDayByDate } = useWindData({
 *     autoRefresh: true,
 *     refreshInterval: 300000 // 5 minutes
 *   });
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error}</div>;
 *
 *   const today = getDayByDate('2025-12-04');
 *   return <div>{today?.displayDate}</div>;
 * }
 * ```
 */
export function useWindData(options: UseWindDataOptions = {}): UseWindDataReturn {
  const {
    autoRefresh = true,
    refreshInterval = DEFAULT_REFRESH_INTERVAL,
    granularity = 'hourly', // NEW: Default to hourly
  } = options;

  const [data, setData] = useState<DayData[] | null>(null);
  const [metadata, setMetadata] = useState<WindHistoryResponse['metadata'] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);

  /**
   * Fetch wind data from the unified API
   */
  const fetchWindData = useCallback(async () => {
    try {
      setError(null);

      // NEW: Add granularity query parameter if not hourly
      const url = granularity === '6min'
        ? '/api/wind-history?granularity=6min'
        : '/api/wind-history';

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const result: WindHistoryResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to fetch wind data');
      }

      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setData(result.data);
        setMetadata(result.metadata);
        setIsLoading(false);
      }
    } catch (err) {
      console.error('[useWindData] Fetch error:', err);

      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setIsLoading(false);
      }
    }
  }, [granularity]);

  /**
   * Manual refresh function
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchWindData();
  }, [fetchWindData]);

  /**
   * Get wind data for a specific date
   */
  const getDayByDate = useCallback((dateKey: string): DayData | undefined => {
    if (!data) return undefined;
    return findDayByDate(data, dateKey);
  }, [data]);

  /**
   * Get the most recent day's data
   */
  const getLatestDay = useCallback((): DayData | undefined => {
    if (!data || data.length === 0) return undefined;
    // Data is sorted newest first
    return data[0];
  }, [data]);

  // Initial fetch on mount
  useEffect(() => {
    isMountedRef.current = true; // Reset to true on mount
    fetchWindData();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchWindData]);

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh) return;

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        fetchWindData();
        scheduleRefresh(); // Schedule next refresh
      }, refreshInterval);
    };

    scheduleRefresh();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, fetchWindData]);

  return {
    data,
    metadata,
    isLoading,
    error,
    refresh,
    getDayByDate,
    getLatestDay,
  };
}

/**
 * Hook for fetching data for a specific date
 *
 * Convenience wrapper around useWindData for components that only need one day
 */
export function useWindDataForDate(dateKey: string, options: UseWindDataOptions = {}): {
  dayData: DayData | undefined;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { data, isLoading, error, refresh } = useWindData(options);

  const dayData = data ? findDayByDate(data, dateKey) : undefined;

  return {
    dayData,
    isLoading,
    error,
    refresh,
  };
}
