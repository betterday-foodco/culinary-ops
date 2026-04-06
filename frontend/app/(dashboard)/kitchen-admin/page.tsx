'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api';

const DAY_LABEL: Record<number, string> = { 1: 'Wednesday', 2: 'Thursday', 3: 'Friday', 4: 'Friday' };

export default function KitchenAdminPage() {
  const [report, setReport] = useState<any[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDay, setFilterDay] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const planData = await api.getCurrentProductionPlan().catch(() => null);
      setPlan(planData);
      if (planData?.id) {
        const reportData = await api.getProductionPlanSubRecipeReport(planData.id);
        // Flatten grouped_by_station into a flat array
        const rows: any[] = [];
        for (const stationRows of Object.values(reportData.grouped_by_station as Record<string, any[]>)) {
          rows.push(...stationRows);
        }
        setReport(rows);
      } else {
        setReport([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = report.filter(r => {
    const matchSearch = !search ||
      (r.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.station_tag ?? '').toLowerCase().includes(search.toLowerCase());
    const matchDay = filterDay === null || r.priority === filterDay;
    return matchSearch && matchDay;
  });

  async function handlePriorityChange(subRecipeId: string, newPriority: number) {
    setSavingId(subRecipeId);
    try {
      await api.updateSubRecipePriority(subRecipeId, newPriority);
      await load();
    } finally {
      setSavingId(null);
    }
  }

  async function handleSubPriorityChange(subRecipeId: string, newSubPriority: number | null) {
    setSavingId(subRecipeId);
    try {
      await api.updateSubRecipe(subRecipeId, { sub_priority: newSubPriority } as any);
      await load();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kitchen Admin View</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {plan ? `${plan.week_label} · ${report.length} sub-recipes` : 'Current production week'}
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search sub-recipes or stations..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div className="flex gap-2">
          {([null, 1, 2, 3] as (number | null)[]).map(day => (
            <button
              key={day ?? 'all'}
              onClick={() => setFilterDay(day)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterDay === day
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {day === null ? 'All Days' : DAY_LABEL[day]}
            </button>
          ))}
        </div>
      </div>

      {/* No plan state */}
      {!loading && !plan && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-2xl mb-2">📅</p>
          <p className="text-sm font-medium text-gray-600">No current production plan found.</p>
          <p className="text-xs text-gray-400 mt-1">
            <a href="/production" className="text-blue-600 hover:underline">Go to Production Plans</a> to create or publish one.
          </p>
        </div>
      )}

      {/* Table */}
      {(loading || plan) && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sub-Recipe</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Station</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Production Day &amp; Order</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty Needed</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scale Factor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">No results</td>
                </tr>
              ) : filtered.map(row => (
                <tr
                  key={row.id}
                  className={`hover:bg-gray-50 ${savingId === row.id ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <a
                      href={`/sub-recipes/${row.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {row.name}
                    </a>
                    {row.sub_recipe_code && (
                      <span className="ml-1 text-xs text-gray-400 font-mono">{row.sub_recipe_code}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.station_tag ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <select
                        value={row.priority ?? ''}
                        onChange={e => handlePriorityChange(row.id, parseInt(e.target.value))}
                        disabled={savingId === row.id}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">— Day —</option>
                        <option value="1">Wednesday</option>
                        <option value="2">Thursday</option>
                        <option value="3">Friday</option>
                      </select>
                      <select
                        value={row.sub_priority ?? ''}
                        onChange={e => handleSubPriorityChange(row.id, parseInt(e.target.value) || null)}
                        disabled={savingId === row.id}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">— Order —</option>
                        <option value="1">P1 / AM</option>
                        <option value="2">P2</option>
                        <option value="3">P3 / PM</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{row.total_quantity ?? '—'} {row.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {row.scale_factor != null ? `×${row.scale_factor}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/sub-recipes/${row.id}`} className="text-xs text-blue-500 hover:underline">
                      Edit Recipe
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
              <span>{filtered.length} sub-recipes shown</span>
              <span>
                Total quantity:{' '}
                <strong className="text-gray-900">
                  {filtered.reduce((s, r) => s + (Number(r.total_quantity) || 0), 0).toFixed(2)} Kgs
                </strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
