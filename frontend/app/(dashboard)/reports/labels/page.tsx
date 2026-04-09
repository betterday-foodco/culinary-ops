'use client';

import { useEffect, useState } from 'react';
import { api } from '@/app/lib/api';

interface Label {
  dish: string;
  diet: string;
  allergens: string;
  employee: string;
  company: string;
  quantity: number;
}

interface LabelsReport {
  ok: boolean;
  week_start: string;
  labels: Label[];
}

function downloadCsv(labels: Label[], weekStart: string) {
  const headers = ['Dish', 'Diet', 'Allergens', 'Employee', 'Company', 'Quantity'];
  const csvRows = [
    headers.join(','),
    ...labels.map((l) =>
      [
        `"${l.dish}"`,
        `"${l.diet}"`,
        `"${(l.allergens || '').replace(/"/g, '""')}"`,
        `"${l.employee}"`,
        `"${l.company}"`,
        l.quantity,
      ].join(','),
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `labels-report-${weekStart || 'all'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LabelsReportPage() {
  const [week, setWeek] = useState('');
  const [labels, setLabels] = useState<Label[]>([]);
  const [weekStart, setWeekStart] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(w?: string) {
    setLoading(true);
    try {
      const data = (await api.bdGetLabelsReport(w || undefined)) as LabelsReport;
      setLabels(data.labels ?? []);
      setWeekStart(data.week_start ?? '');
    } catch (e: any) {
      console.error(e);
      setLabels([]);
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
            <h1 className="text-2xl font-bold text-[#003141]">Labels Report</h1>
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
              onClick={() => downloadCsv(labels, weekStart)}
              disabled={labels.length === 0}
              className="px-4 py-2 bg-[#003141] text-white text-sm font-medium rounded-lg hover:bg-[#003141]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={() => window.print()}
              disabled={labels.length === 0}
              className="px-4 py-2 border border-[#003141] text-[#003141] text-sm font-medium rounded-lg hover:bg-[#003141]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Print
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#003141] border-t-transparent" />
          </div>
        ) : labels.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm text-center py-20 text-gray-400">
            No label data for this week
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-2">
            {labels.map((label, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100 print:rounded-lg print:shadow-none print:border print:p-3 print:break-inside-avoid"
              >
                <h3 className="text-lg font-bold text-[#003141] mb-2 leading-tight">
                  {label.dish}
                </h3>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {label.diet && (
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                      {label.diet}
                    </span>
                  )}
                  {label.allergens &&
                    label.allergens.split(',').map((a) => (
                      <span
                        key={a.trim()}
                        className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-xs font-medium"
                      >
                        {a.trim()}
                      </span>
                    ))}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Employee</span>
                    <span className="font-medium text-gray-900">{label.employee}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Company</span>
                    <span className="font-medium text-gray-900">{label.company}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Quantity</span>
                    <span className="font-bold text-[#003141] text-base">{label.quantity}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
