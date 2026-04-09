'use client';

import { useEffect, useState } from 'react';
import { api } from '@/app/lib/api';

interface DeliveryRow {
  client: string;
  company_id: string;
  meals: number;
  total: number;
  address: string;
  gate_code: string;
  email: string;
  phone: string;
  notes: string;
  bags: string;
  duration: string;
  business_hours: string;
  assigned_driver: string;
  delivery_day: string;
}

interface DeliveryReport {
  ok: boolean;
  week_start: string;
  rows: DeliveryRow[];
}

const HEADERS = ['Client','Meals','Total','Address','Gate Code','Email','Phone','Notes','Bags','Duration','Business Hours','Assigned Driver'];

function downloadCsv(rows: DeliveryRow[], weekStart: string) {
  const csvRows = [
    HEADERS.join(','),
    ...rows.map((r) =>
      [
        `"${r.client}"`, r.meals, r.total?.toFixed(2),
        `"${r.address}"`, `"${r.gate_code || ''}"`,
        `"${r.email}"`, `"${r.phone}"`,
        `"${(r.notes || '').replace(/"/g, '""')}"`,
        `"${r.bags || ''}"`, `"${r.duration || ''}"`,
        `"${r.business_hours || ''}"`, `"${r.assigned_driver || ''}"`,
      ].join(','),
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `delivery-report-${weekStart || 'all'}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function DeliveryReportPage() {
  const [week, setWeek] = useState('');
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [weekStart, setWeekStart] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(w?: string) {
    setLoading(true);
    try {
      const data = (await api.bdGetDeliveryReport(w || undefined)) as DeliveryReport;
      setRows(data.rows ?? []);
      setWeekStart(data.week_start ?? '');
    } catch (e: any) { console.error(e); setRows([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-[#FAEBDA] p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#003141]">Delivery Report</h1>
            {weekStart && <p className="text-sm text-[#003141]/60 mt-0.5">Week of {weekStart}</p>}
          </div>
          <div className="flex items-center gap-3">
            <input type="week" value={week} onChange={e => { setWeek(e.target.value); load(e.target.value); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003141]/30" />
            <button onClick={() => window.print()}
              className="px-4 py-2 bg-[#003141]/10 text-[#003141] text-sm font-medium rounded-lg hover:bg-[#003141]/20 transition-colors">
              Print / PDF
            </button>
            <button onClick={() => downloadCsv(rows, weekStart)} disabled={!rows.length}
              className="px-4 py-2 bg-[#003141] text-white text-sm font-medium rounded-lg hover:bg-[#003141]/90 disabled:opacity-40 transition-colors">
              Export CSV
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#003141] border-t-transparent" />
            </div>
          ) : !rows.length ? (
            <div className="text-center py-20 text-gray-400">No delivery data for this week</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#003141] text-white">
                    {HEADERS.map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-[#FAEBDA]/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{row.client}</td>
                      <td className="px-4 py-3 text-gray-700 font-bold">{row.meals}</td>
                      <td className="px-4 py-3 text-gray-700 font-bold">${row.total?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{row.address}</td>
                      <td className="px-4 py-3 text-gray-600">{row.gate_code || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{row.email}</td>
                      <td className="px-4 py-3 text-gray-600">{row.phone}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{row.notes || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{row.bags || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{row.duration || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{row.business_hours || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{row.assigned_driver || '—'}</td>
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
