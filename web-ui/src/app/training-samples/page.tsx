'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, Cell, ErrorBar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Navigation from '@/components/Navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HourlyData {
  hour: string;
  wspd_avg_kt: number;
  gst_max_kt: number;
}
interface DayActual {
  date: string;
  hourly: HourlyData[];
}
interface TrainingSample {
  issued: string;
  issuance_time: string;
  number: number;
  complete: boolean;
  warnings: string | null;
  forecast: Record<string, string>;
  actual: Record<string, DayActual>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOURS = [10, 11, 12, 13, 14, 15, 16, 17];
const DAYS = [0, 1, 2, 3, 4];
const CELL_H = 30;
const LABEL_W = 64;
const DAY_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
const FC_COLORS  = ['#1e40af', '#0ea5e9', '#f59e0b', '#7c3aed'];
const FC_TIMES   = ['~4 AM', '~10 AM', '~4 PM', '~10 PM'];
const MONTH_ORDER = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_NAMES: Record<string, string> = {
  jan:'January', feb:'February', mar:'March',    apr:'April',
  may:'May',     jun:'June',     jul:'July',      aug:'August',
  sep:'September', oct:'October', nov:'November', dec:'December',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wspdColor(kt: number): string {
  const stops = [
    { v: 0,  r: 240, g: 249, b: 255 },
    { v: 8,  r: 147, g: 197, b: 253 },
    { v: 15, r: 250, g: 204, b: 21  },
    { v: 22, r: 249, g: 115, b: 22  },
    { v: 28, r: 220, g: 38,  b: 38  },
  ];
  const c = Math.min(Math.max(kt, 0), 30);
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (c >= stops[i].v && c <= stops[i + 1].v) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const t = lo.v === hi.v ? 0 : (c - lo.v) / (hi.v - lo.v);
  return `rgb(${Math.round(lo.r+t*(hi.r-lo.r))},${Math.round(lo.g+t*(hi.g-lo.g))},${Math.round(lo.b+t*(hi.b-lo.b))})`;
}

function getHourWspd(sample: TrainingSample, day: number, hour: number): number | null {
  const entry = sample.actual?.[`day_${day}`]?.hourly.find(h => parseInt(h.hour) === hour);
  return entry?.wspd_avg_kt ?? null;
}

function getDaySummary(sample: TrainingSample, day: number) {
  const hourly = sample.actual?.[`day_${day}`]?.hourly;
  if (!hourly?.length) return null;
  const wspds = hourly.map(h => h.wspd_avg_kt);
  const gsts  = hourly.map(h => h.gst_max_kt);
  return {
    avgWspd:  wspds.reduce((a, b) => a + b, 0) / wspds.length,
    maxGst:   Math.max(...gsts),
    peakWspd: Math.max(...wspds),
  };
}

function shortDate(iso: string): { md: string; year: string } {
  try {
    const dt = new Date(iso);
    return { md: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), year: String(dt.getFullYear()) };
  } catch { return { md: iso, year: '' }; }
}

function defaultFile(): string {
  return `${MONTH_ORDER[new Date().getMonth()]}_fc2_examples.json`;
}

function groupByMonth(files: string[]): Record<string, string[]> {
  const g: Record<string, string[]> = {};
  files.forEach(f => { const m = f.split('_')[0]; (g[m] ??= []).push(f); });
  return g;
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrainingSamplesPage() {
  const [fileList, setFileList]         = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState(defaultFile());
  const [samples, setSamples]           = useState<TrainingSample[]>([]);
  const [allFcSamples, setAllFcSamples] = useState<Record<number, TrainingSample[]>>({});
  const [loading, setLoading]           = useState(false);
  const [selectedDay, setSelectedDay]   = useState(0);
  const [selectedIdx, setSelectedIdx]   = useState(0);
  const [tooltip, setTooltip]           = useState<{ val: number; x: number; y: number } | null>(null);
  const [forecastOpen, setForecastOpen] = useState(true);
  const [qualityOpen, setQualityOpen]   = useState(true);

  // Fetch file list
  useEffect(() => {
    fetch('/api/training-samples').then(r => r.json()).then(d => setFileList(d.files ?? []));
  }, []);

  // Fetch selected file
  useEffect(() => {
    if (!selectedFile) return;
    setLoading(true);
    fetch(`/api/training-samples?file=${selectedFile}`)
      .then(r => r.json())
      .then(d => { setSamples(Array.isArray(d) ? d : []); setSelectedIdx(0); setLoading(false); });
  }, [selectedFile]);

  // Fetch all 4 FC files for the current month (for FC bias chart)
  useEffect(() => {
    const month = selectedFile.split('_')[0];
    Promise.all([1, 2, 3, 4].map(fc =>
      fetch(`/api/training-samples?file=${month}_fc${fc}_examples.json`)
        .then(r => r.json())
        .then(d => Array.isArray(d) ? d : [])
    )).then(results => {
      setAllFcSamples({ 1: results[0], 2: results[1], 3: results[2], 4: results[3] });
    });
  }, [selectedFile]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const sample     = samples[selectedIdx];
  const currentFc  = parseInt(selectedFile.match(/fc(\d)/)?.[1] ?? '1');

  const peakPerSample = samples.map(s => getDaySummary(s, 0)?.peakWspd ?? 0);
  const calmCount     = peakPerSample.filter(v => v < 10).length;
  const modCount      = peakPerSample.filter(v => v >= 10 && v <= 20).length;
  const strongCount   = peakPerSample.filter(v => v > 20).length;
  const warnCount     = samples.filter(s => s.warnings).length;
  const years         = samples.map(s => new Date(s.issued).getFullYear());
  const yearRange     = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '';

  const grouped = groupByMonth(fileList);

  // Chart 1 — FC bias: mean D0 avg WSPD per FC
  const fcBiasData = [1, 2, 3, 4].map((fc, i) => {
    const s = allFcSamples[fc] ?? [];
    const avgs = s.map(x => getDaySummary(x, 0)?.avgWspd).filter((v): v is number => v != null);
    const peaks = s.map(x => getDaySummary(x, 0)?.peakWspd ?? 0);
    return {
      label: `FC${fc}`,
      time: FC_TIMES[i],
      wspd: avgs.length ? +mean(avgs).toFixed(1) : 0,
      calm: peaks.filter(v => v < 10).length,
      moderate: peaks.filter(v => v >= 10 && v <= 20).length,
      strong: peaks.filter(v => v > 20).length,
    };
  });

  // Chart 2 — WSPD by day D0→D4: mean + error bars (asymmetric min/max)
  const wspdByDay = DAYS.map(d => {
    const avgs = samples.map(s => getDaySummary(s, d)?.avgWspd).filter((v): v is number => v != null);
    if (!avgs.length) return { day: `D${d}`, mean: 0, error: [0, 0] as [number, number] };
    const m = mean(avgs);
    return {
      day: `D${d}`,
      mean: +m.toFixed(1),
      error: [+(m - Math.min(...avgs)).toFixed(1), +(Math.max(...avgs) - m).toFixed(1)] as [number, number],
    };
  });

  // Chart 3 — Diurnal profile: mean WSPD by hour for each day D0–D4
  const diurnalData = HOURS.map(h => {
    const pt: Record<string, number | string> = { hour: `${h}h` };
    DAYS.forEach(d => {
      const vals = samples.map(s => getHourWspd(s, d, h)).filter((v): v is number => v !== null);
      pt[`d${d}`] = vals.length ? +mean(vals).toFixed(1) : 0;
    });
    return pt;
  });

  // Chart 4 — Category balance by day
  const categoryByDay = DAYS.map(d => {
    const peaks = samples.map(s => getDaySummary(s, d)?.peakWspd ?? 0);
    return {
      day: `D${d}`,
      calm:     peaks.filter(v => v < 10).length,
      moderate: peaks.filter(v => v >= 10 && v <= 20).length,
      strong:   peaks.filter(v => v > 20).length,
    };
  });

  const chartMargin = { top: 8, right: 12, bottom: 8, left: 0 };
  const axisProps = { tick: { fontSize: 10, fill: '#9ca3af' } };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Training Samples Explorer</h1>
            <p className="text-xs text-gray-400 mt-0.5">Few-shot examples loaded into the LLM prompt</p>
          </div>
          <select
            value={selectedFile}
            onChange={e => setSelectedFile(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MONTH_ORDER.filter(m => grouped[m]).map(m => (
              <optgroup key={m} label={MONTH_NAMES[m]}>
                {grouped[m].map(f => (
                  <option key={f} value={f}>
                    {f.replace('_examples.json', '').replace('_', ' FC').toUpperCase()}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* ── Meta chips ── */}
        {samples.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Chip>{samples.length} examples · {yearRange}</Chip>
            <Chip color="blue">◼ {calmCount} calm &lt;10 kt</Chip>
            <Chip color="yellow">◼ {modCount} moderate 10–20 kt</Chip>
            <Chip color="red">◼ {strongCount} strong &gt;20 kt</Chip>
            {warnCount > 0 && <Chip color="orange">⚠ {warnCount} with advisories</Chip>}
          </div>
        )}

        {loading && <p className="text-xs text-gray-400">Loading…</p>}

        {/* ── Wind Matrix ── */}
        {samples.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Wind Speed Matrix</h2>
                <p className="text-xs text-gray-400 mt-0.5">avg WSPD (kt) · 10 AM – 5 PM · click a row to inspect</p>
              </div>
              <div className="flex gap-1">
                {DAYS.map(d => (
                  <button
                    key={d}
                    onClick={() => setSelectedDay(d)}
                    className="text-xs px-2.5 py-1 rounded font-medium transition-colors"
                    style={selectedDay === d ? { backgroundColor: DAY_COLORS[d], color: '#fff' } : { backgroundColor: '#f3f4f6', color: '#6b7280' }}
                  >
                    D{d}
                  </button>
                ))}
              </div>
            </div>

            <div className="select-none">
              <div className="mb-1" style={{ display: 'grid', gridTemplateColumns: `${LABEL_W}px repeat(${HOURS.length}, 1fr)`, gap: 2 }}>
                <div />
                {HOURS.map(h => <div key={h} className="text-center text-xs text-gray-400 font-mono">{h}h</div>)}
              </div>
              {samples.map((s, si) => (
                <div
                  key={si}
                  className="mb-0.5 cursor-pointer"
                  style={{ display: 'grid', gridTemplateColumns: `${LABEL_W}px repeat(${HOURS.length}, 1fr)`, gap: 2, alignItems: 'center' }}
                  onClick={() => setSelectedIdx(si)}
                >
                  <div
                    className="text-xs text-right pr-2 font-mono transition-colors leading-tight"
                    style={{ color: si === selectedIdx ? '#1d4ed8' : '#9ca3af', fontWeight: si === selectedIdx ? 600 : 400 }}
                  >
                    {shortDate(s.issued).md}
                    <span className="block text-gray-300" style={{ fontSize: 9, fontWeight: 400 }}>{shortDate(s.issued).year}</span>
                  </div>
                  {HOURS.map((hour, hi) => {
                    const val = getHourWspd(s, selectedDay, hour);
                    return (
                      <div
                        key={hi}
                        className="rounded-sm transition-opacity"
                        style={{
                          height: CELL_H,
                          backgroundColor: val !== null ? wspdColor(val) : '#f9fafb',
                          opacity: val === null ? 0.25 : 1,
                          outline: si === selectedIdx ? '2px solid #3b82f6' : '1px solid transparent',
                          outlineOffset: -1,
                        }}
                        onMouseEnter={e => {
                          if (val !== null) {
                            const r = (e.target as HTMLElement).getBoundingClientRect();
                            setTooltip({ val, x: r.left + r.width / 2, y: r.top });
                          }
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs text-gray-400">0</span>
              <div className="h-2 rounded-full flex-1" style={{ maxWidth: 180, background: `linear-gradient(to right, ${wspdColor(0)}, ${wspdColor(8)}, ${wspdColor(15)}, ${wspdColor(22)}, ${wspdColor(28)})` }} />
              <span className="text-xs text-gray-400">28+ kt</span>
            </div>
          </div>
        )}

        {/* Floating tooltip */}
        {tooltip && (
          <div className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1 shadow-lg" style={{ left: tooltip.x, top: tooltip.y - 34, transform: 'translateX(-50%)' }}>
            {tooltip.val.toFixed(1)} kt
          </div>
        )}

        {/* ── Data Quality ── */}
        {samples.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
              onClick={() => setQualityOpen(o => !o)}
            >
              <div>
                <span className="text-sm font-semibold text-gray-800">Data Quality & Bias</span>
                <span className="ml-2 text-xs text-gray-400">FC1–FC4 comparison · day-offset bias · diurnal pattern · category balance</span>
              </div>
              <span className="text-gray-400 text-xs ml-4 shrink-0">{qualityOpen ? '▲' : '▼'}</span>
            </button>

            {qualityOpen && (
              <div className="px-5 pb-6 border-t border-gray-50 space-y-4 pt-4">

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Chart 1 — FC Bias */}
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-0.5">Forecast Number Bias</p>
                    <p className="text-xs text-gray-400 mb-3">mean D0 avg WSPD per FC · current FC highlighted</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={fcBiasData} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis dataKey="label" {...axisProps} />
                        <YAxis {...axisProps} unit=" kt" width={36} domain={[0, 'auto']} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }}
                          content={({ payload, label }) => {
                            if (!payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-gray-900 text-white text-xs rounded px-2 py-1.5 space-y-0.5">
                                <div className="font-semibold">{label} · {d.time}</div>
                                <div>Mean WSPD: {d.wspd} kt</div>
                                <div className="text-gray-400">{d.calm}C · {d.moderate}M · {d.strong}S</div>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="wspd" radius={[3, 3, 0, 0]}>
                          {fcBiasData.map((_, i) => (
                            <Cell key={i} fill={i + 1 === currentFc ? FC_COLORS[i] : '#d1d5db'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Chart 3 — Diurnal Profile */}
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-0.5">Diurnal Profile</p>
                    <p className="text-xs text-gray-400 mb-3">mean WSPD by hour · D0–D4 overlaid</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={diurnalData} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="hour" {...axisProps} />
                        <YAxis {...axisProps} unit=" kt" width={36} domain={[0, 'auto']} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }}
                          formatter={(v: unknown, name: string | undefined) => [`${v} kt`, name ?? '']}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {DAYS.map(d => (
                          <Line key={d} type="monotone" dataKey={`d${d}`} name={`D${d}`} stroke={DAY_COLORS[d]} strokeWidth={2} dot={{ r: 2.5, fill: DAY_COLORS[d], strokeWidth: 0 }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Chart 2 — WSPD by Day */}
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-0.5">Avg WSPD by Forecast Day</p>
                    <p className="text-xs text-gray-400 mb-3">mean ± range across all 15 examples</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={wspdByDay} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis dataKey="day" {...axisProps} />
                        <YAxis {...axisProps} unit=" kt" width={36} domain={[0, 'auto']} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }}
                          content={({ payload, label }) => {
                            if (!payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-gray-900 text-white text-xs rounded px-2 py-1.5 space-y-0.5">
                                <div className="font-semibold">{label}</div>
                                <div>Mean: {d.mean} kt</div>
                                <div className="text-gray-400">Range: {+(d.mean - d.error[0]).toFixed(1)}–{+(d.mean + d.error[1]).toFixed(1)} kt</div>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="mean" radius={[3, 3, 0, 0]}>
                          {wspdByDay.map((_, i) => <Cell key={i} fill={DAY_COLORS[i]} />)}
                          <ErrorBar dataKey="error" width={4} strokeWidth={1.5} stroke="#6b7280" direction="y" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Chart 4 — Category Balance */}
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-0.5">Wind Category Balance by Day</p>
                    <p className="text-xs text-gray-400 mb-3">calm / moderate / strong count per forecast day</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={categoryByDay} margin={chartMargin}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis dataKey="day" {...axisProps} />
                        <YAxis {...axisProps} allowDecimals={false} width={24} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }}
                          formatter={(v, name) => [`${v}`, name ?? '']}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="calm"     stackId="a" fill="#93c5fd" name="calm"     radius={[0, 0, 0, 0]} />
                        <Bar dataKey="moderate" stackId="a" fill="#fbbf24" name="moderate" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="strong"   stackId="a" fill="#ef4444" name="strong"   radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}

        {/* ── NWS Forecast Text ── */}
        {sample && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
              onClick={() => setForecastOpen(o => !o)}
            >
              <span className="text-sm font-semibold text-gray-800">
                NWS Forecast Text · Ex {selectedIdx + 1}
                {sample.warnings && <span className="ml-2 text-xs font-normal text-orange-500">⚠ {sample.warnings}</span>}
              </span>
              <span className="text-gray-400 text-xs">{forecastOpen ? '▲' : '▼'}</span>
            </button>
            {forecastOpen && (
              <div className="px-5 pb-5 border-t border-gray-50 space-y-3 mt-3">
                {Object.entries(sample.forecast).map(([key, text]) => (
                  <div key={key}>
                    <span className="text-xs font-mono font-semibold text-blue-600 uppercase tracking-wide">{key.replace(/_/g, ' ')}</span>
                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ children, color }: { children: React.ReactNode; color?: 'blue' | 'yellow' | 'red' | 'orange' }) {
  const styles: Record<string, string> = {
    blue:   'bg-blue-50 border-blue-100 text-blue-700',
    yellow: 'bg-yellow-50 border-yellow-100 text-yellow-700',
    red:    'bg-red-50 border-red-100 text-red-700',
    orange: 'bg-orange-50 border-orange-100 text-orange-700',
    default:'bg-white border-gray-200 text-gray-600',
  };
  return <span className={`text-xs border rounded-full px-3 py-1 ${styles[color ?? 'default']}`}>{children}</span>;
}
