'use client';

/**
 * DayComparisonCard Component
 *
 * Displays a single day's forecast vs actuals comparison with charts and summary.
 */

import HourlyComparisonChart from './HourlyComparisonChart';

interface HourlyData {
  hour: number;
  displayTime: string;
  forecast: { wspd: number; gst: number } | null;
  actual: { wspd: number; gst: number } | null;
  error: { wspd: number; gst: number } | null;
}

interface DayComparisonCardProps {
  dayIndex: number;
  date: string;
  displayDate: string;
  dayLabel: string;
  hourly: HourlyData[];
  summary: {
    avgWspdError: number | null;
    avgGstError: number | null;
    maxWspdError: number | null;
    maxGstError: number | null;
    hoursWithActuals: number;
    totalHours: number;
  };
  status: 'complete' | 'partial' | 'no_data' | 'future';
}

function StatusBadge({ status }: { status: DayComparisonCardProps['status'] }) {
  const statusConfig = {
    complete: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'Complete',
    },
    partial: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      label: 'Partial Data',
    },
    no_data: {
      bg: 'bg-gray-100',
      text: 'text-gray-600',
      label: 'No Actuals',
    },
    future: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      label: 'Future',
    },
  };

  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

function ErrorDisplay({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return (
      <div className="text-center">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-400">--</p>
      </div>
    );
  }

  const isGood = Math.abs(value) <= 2;
  const isBad = Math.abs(value) > 4;

  return (
    <div className="text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${isGood ? 'text-green-600' : isBad ? 'text-red-600' : 'text-yellow-600'}`}>
        {value.toFixed(1)} kt
      </p>
    </div>
  );
}

export default function DayComparisonCard({
  dayIndex,
  displayDate,
  dayLabel,
  hourly,
  summary,
  status,
}: DayComparisonCardProps) {
  const showCharts = status !== 'future' || hourly.length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            Day {dayIndex}: {dayLabel}
          </h3>
          <p className="text-sm text-gray-500">{displayDate}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Status Messages */}
        {status === 'future' && (
          <div className="text-center py-8 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-2 text-sm">Actual data not yet available (future date)</p>
            {hourly.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Forecast predictions are shown below
              </p>
            )}
          </div>
        )}

        {status === 'no_data' && (
          <div className="text-center py-8 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="mt-2 text-sm">No actual wind data recorded for this date</p>
          </div>
        )}

        {/* Charts */}
        {showCharts && hourly.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <HourlyComparisonChart
              data={hourly}
              metric="wspd"
              title="Wind Speed (WSPD)"
            />
            <HourlyComparisonChart
              data={hourly}
              metric="gst"
              title="Gust Speed (GST)"
            />
          </div>
        )}

        {/* Summary */}
        {(status === 'complete' || status === 'partial') && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ErrorDisplay label="Avg WSPD Error" value={summary.avgWspdError} />
              <ErrorDisplay label="Avg GST Error" value={summary.avgGstError} />
              <ErrorDisplay label="Max WSPD Error" value={summary.maxWspdError} />
              <ErrorDisplay label="Max GST Error" value={summary.maxGstError} />
            </div>
            <p className="text-xs text-gray-500 text-center mt-3">
              Data coverage: {summary.hoursWithActuals}/{summary.totalHours} hours with actuals
            </p>
          </div>
        )}

        {/* Future date with forecast only - show charts */}
        {status === 'future' && hourly.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 text-center mb-3">
              Forecast predictions (actuals pending)
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HourlyComparisonChart
                data={hourly}
                metric="wspd"
                title="Wind Speed (WSPD)"
              />
              <HourlyComparisonChart
                data={hourly}
                metric="gst"
                title="Gust Speed (GST)"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
