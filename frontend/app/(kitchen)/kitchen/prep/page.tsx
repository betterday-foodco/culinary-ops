'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, PlanSubRecipeReport, PlanSubRecipeRow } from '../../../lib/api';

export default function PrepListPage() {
  const [report, setReport] = useState<PlanSubRecipeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedStation, setExpandedStation] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      // Get current plan first
      const plan = await api.getCurrentProductionPlan();
      if (!plan) { setError('No active production plan'); return; }
      const r = await api.getProductionPlanSubRecipeReport(plan.id);
      setReport(r);
      // Auto-expand first station
      const firstStation = Object.keys(r.grouped_by_station ?? {})[0];
      if (firstStation) setExpandedStation(firstStation);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load prep list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="w-10 h-10 bg-bd-yellow rounded-xl mx-auto mb-3 flex items-center justify-center animate-pulse">
          <span className="text-brand-700 font-black text-xs">BD</span>
        </div>
        <p className="text-sm text-gray-500">Loading prep list…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="text-center py-20">
      <p className="text-red-500 text-sm">{error}</p>
      <button onClick={load} className="mt-3 text-brand-600 text-sm underline">Retry</button>
    </div>
  );

  if (!report) return null;

  const grouped = report.grouped_by_station ?? {};
  const stations = Object.keys(grouped).sort();

  // Flatten all rows for search
  const allRows: (PlanSubRecipeRow & { station: string })[] = stations.flatMap(s =>
    grouped[s].map(r => ({ ...r, station: s }))
  );
  const searchLower = search.toLowerCase();
  const searchResults = search.trim()
    ? allRows.filter(r => (r.display_name || r.name).toLowerCase().includes(searchLower))
    : null;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">Prep Masterlist</h1>
        <p className="text-sm text-gray-500">{report.week_label} · {report.total_sub_recipes} sub-recipes</p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sub-recipes…"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Search results */}
      {searchResults ? (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {searchResults.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-400">No results for &quot;{search}&quot;</p>
          ) : searchResults.map(row => (
            <PrepRow key={row.id} row={row} stationLabel={row.station} />
          ))}
        </div>
      ) : (
        /* Station accordion */
        <div className="space-y-3">
          {stations.map(station => {
            const rows = grouped[station];
            const isOpen = expandedStation === station;
            return (
              <div key={station} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setExpandedStation(isOpen ? null : station)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{station}</span>
                    <span className="text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full font-medium">{rows.length}</span>
                  </div>
                  <span className="text-gray-400 text-lg">{isOpen ? '▲' : '▾'}</span>
                </button>
                {isOpen && (
                  <div className="divide-y divide-gray-100 border-t border-gray-100">
                    {rows.map(row => <PrepRow key={row.id} row={row} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PrepRow({ row, stationLabel }: { row: PlanSubRecipeRow; stationLabel?: string }) {
  const [open, setOpen] = useState(false);
  const name = row.display_name || row.name;
  const priorityColor = row.priority === 1 ? 'bg-red-100 text-red-700' : row.priority === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600';

  return (
    <div>
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 leading-tight">{name}</p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${priorityColor}`}>P{row.priority}</span>
            {stationLabel && <span className="text-[10px] text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full">{stationLabel}</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {row.total_quantity.toFixed(2)} {row.unit}
            {row.production_day && ` · ${row.production_day}`}
          </p>
        </div>
        <span className="text-gray-300 flex-shrink-0">{open ? '▲' : '▾'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 bg-gray-50 space-y-3">
          {row.instructions && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Instructions</p>
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{row.instructions}</p>
            </div>
          )}
          {(row.ingredients?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ingredients</p>
              <div className="space-y-1">
                {row.ingredients.map((ing, i) => (
                  <div key={i} className="flex justify-between text-xs text-gray-700">
                    <span>{ing.display_name || ing.name}</span>
                    <span className="font-semibold text-gray-900 ml-2">{ing.quantity.toFixed(3)} {ing.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
