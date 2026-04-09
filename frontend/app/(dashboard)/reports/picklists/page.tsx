'use client';

import { useEffect, useState } from 'react';
import { api } from '@/app/lib/api';

interface PicklistRow {
  qty: number;
  diet: string;
  dish: string;
  sku: string;
}

interface PicklistReport {
  ok: boolean;
  week_start: string;
  rows: PicklistRow[];
}

function downloadCsv(rows: PicklistRow[], weekStart: string) {
  const headers = ['Qty', 'Diet', 'Dish', 'SKU'];
  const csvRows = [
    headers.join(','),
    ...rows.map((r) =>
      [r.qty, `"${r.diet}"`, `"${r.dish}"`, `"${r.sku}"`].join(','),
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `picklist-report-${weekStart || 'all'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PicklistReportPage() {
  const [week, setWeek] = useState('');
  const [rows, setRows] = useState<PicklistRow[]>([]);
  const [weekStart, setWeekStart] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(w?: string) {
    setLoading(true);
    try {
      const data = (await api.bdGetPicklistReport(w || undefined)) as PicklistReport;
      setRows(data.rows ?? []);
      setWeekStart(data.week_start ?? '');
    } catch (e: any) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleWeekChange(value: string) {
    setWeek(value);
    load(value);
  }

  return (
    <div className="min-h-screen bg-[#FAEBDA] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#003141]">Picklist Report</h1>
            {weekStart && (
              <p className="text-sm text-[#003141]/60 mt-0.5">Week of {weekStart}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="week"
              value={week}
              onChange={(e) => handleWeekChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003141]/30"
            />
            <button
              onClick={() => downloadCsv(rows, weekStart)}
              disabled={rows.length === 0}
              className="px-4 py-2 bg-[#003141] text-white text-sm font-medium rounded-lg hover:bg-[#003141]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#003141] border-t-transparent" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              No picklist data for this week
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#003141] text-white">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Qty</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Diet</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Dish</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">SKU</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-[#FAEBDA]/30 transition-colors">
                      <td className="px-5 py-3 font-bold text-[#003141]">{row.qty}</td>
                      <td className="px-5 py-3 text-gray-700">{row.diet}</td>
                      <td className="px-5 py-3 font-medium text-gray-900">{row.dish}</td>
                      <td className="px-5 py-3 text-gray-500 font-mono text-xs">{row.sku}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
