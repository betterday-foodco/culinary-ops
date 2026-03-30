'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, SubRecipe } from '../../lib/api';

const priorityLabel = (p: number) => ['', 'Wednesday', 'Thursday', 'Friday', 'Friday'][p] ?? `Day ${p}`;
const priorityColor = (p: number) => [
  '',
  'bg-blue-100 text-blue-800',    // Wednesday
  'bg-green-100 text-green-800',  // Thursday
  'bg-orange-100 text-orange-800', // Friday
  'bg-orange-100 text-orange-800', // Friday (p4)
][p] ?? 'bg-gray-100 text-gray-700';

const PRIORITY_INFO: Record<number, { label: string; color: string }> = {
  1: { label: priorityLabel(1), color: priorityColor(1) },
  2: { label: priorityLabel(2), color: priorityColor(2) },
  3: { label: priorityLabel(3), color: priorityColor(3) },
  4: { label: priorityLabel(4), color: priorityColor(4) },
  5: { label: 'P5 – Optional',  color: 'bg-gray-100 text-gray-500' },
};

export default function SubRecipesPage() {
  const router = useRouter();

  const [subRecipes, setSubRecipes]       = useState<SubRecipe[]>([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [stationTags, setStationTags]     = useState<string[]>([]);
  const [productionDays, setProductionDays] = useState<string[]>([]);

  // Sidebar filters
  const [selectedStations, setSelectedStations] = useState<Set<string>>(new Set());
  const [selectedDays,     setSelectedDays]      = useState<Set<string>>(new Set());
  const [selectedPriorities, setSelectedPriorities] = useState<Set<number>>(new Set());

  // Sort
  const [sortBy, setSortBy] = useState<'name' | 'priority' | 'cost' | 'station'>('name');

  async function load() {
    setLoading(true);
    try {
      const [data, tags, days] = await Promise.all([
        api.getSubRecipes(),
        api.getStationTags(),
        api.getProductionDays(),
      ]);
      setSubRecipes(data);
      setStationTags(tags as string[]);
      setProductionDays(days as string[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this sub-recipe? This cannot be undone.')) return;
    try {
      await api.deleteSubRecipe(id);
      load();
    } catch (err: any) { alert(err.message); }
  }

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  }

  // Derived
  const filtered = subRecipes
    .filter((s) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        s.name.toLowerCase().includes(q) ||
        s.sub_recipe_code.toLowerCase().includes(q) ||
        (s.station_tag ?? '').toLowerCase().includes(q);
      const matchStation = selectedStations.size === 0 ||
        selectedStations.has(s.station_tag ?? 'Unassigned');
      const matchDay = selectedDays.size === 0 ||
        selectedDays.has(s.production_day ?? '');
      const matchPriority = selectedPriorities.size === 0 ||
        selectedPriorities.has((s as any).priority ?? 3);
      return matchSearch && matchStation && matchDay && matchPriority;
    })
    .sort((a, b) => {
      if (sortBy === 'priority') return ((a as any).priority ?? 3) - ((b as any).priority ?? 3);
      if (sortBy === 'cost') return b.computed_cost - a.computed_cost;
      if (sortBy === 'station') return (a.station_tag ?? 'ZZZ').localeCompare(b.station_tag ?? 'ZZZ');
      return a.name.localeCompare(b.name);
    });

  // Station counts for sidebar
  const stationCounts = subRecipes.reduce<Record<string, number>>((acc, s) => {
    const k = s.station_tag ?? 'Unassigned';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const dayCounts = subRecipes.reduce<Record<string, number>>((acc, s) => {
    const k = s.production_day ?? '(none)';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const priorityCounts = subRecipes.reduce<Record<number, number>>((acc, s) => {
    const k = (s as any).priority ?? 3;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const hasFilters = selectedStations.size > 0 || selectedDays.size > 0 || selectedPriorities.size > 0;

  return (
    <div className="flex h-full">
      {/* ── Left Sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter</p>
            {hasFilters && (
              <button
                onClick={() => {
                  setSelectedStations(new Set());
                  setSelectedDays(new Set());
                  setSelectedPriorities(new Set());
                }}
                className="text-xs text-brand-600 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Station filter */}
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Station</p>
          <div className="space-y-1">
            {Object.entries(stationCounts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([station, count]) => (
                <label key={station} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selectedStations.has(station)}
                    onChange={() => setSelectedStations((s) => toggleSet(s, station))}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs text-gray-600 group-hover:text-gray-900 flex-1 truncate">
                    {station}
                  </span>
                  <span className="text-xs text-gray-400">{count}</span>
                </label>
              ))}
          </div>
        </div>

        {/* Production day filter */}
        {productionDays.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Production Day
            </p>
            <div className="space-y-1">
              {productionDays.map((day) => (
                <label key={day} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selectedDays.has(day)}
                    onChange={() => setSelectedDays((s) => toggleSet(s, day))}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs text-gray-600 group-hover:text-gray-900 flex-1">
                    {day}
                  </span>
                  <span className="text-xs text-gray-400">{dayCounts[day] ?? 0}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Priority filter */}
        <div className="px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Production Day</p>
          <div className="space-y-1">
            {([1, 2, 3, 4, 5] as const).map((p) => {
              const info = PRIORITY_INFO[p];
              return (
                <label key={p} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selectedPriorities.has(p)}
                    onChange={() => setSelectedPriorities((s) => toggleSet(s, p))}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${info.color}`}>
                    {info.label}
                  </span>
                  <span className="text-xs text-gray-400">{priorityCounts[p] ?? 0}</span>
                </label>
              );
            })}
          </div>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Sub-Recipes</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {loading ? 'Loading...' : `${filtered.length} of ${subRecipes.length} sub-recipes`}
              </p>
            </div>
            <button
              onClick={() => router.push('/sub-recipes/new')}
              className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
            >
              + New Sub-Recipe
            </button>
          </div>

          {/* Search + Sort bar */}
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search by name, code or station..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              )}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="name">Sort: A → Z</option>
              <option value="priority">Sort: Priority</option>
              <option value="cost">Sort: Cost ↓</option>
              <option value="station">Sort: Station</option>
            </select>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {[...selectedStations].map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
                >
                  {s}
                  <button onClick={() => setSelectedStations((prev) => toggleSet(prev, s))}>×</button>
                </span>
              ))}
              {[...selectedDays].map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium"
                >
                  Day: {d}
                  <button onClick={() => setSelectedDays((prev) => toggleSet(prev, d))}>×</button>
                </span>
              ))}
              {[...selectedPriorities].sort().map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-full text-xs font-medium"
                >
                  {priorityLabel(p)}
                  <button onClick={() => setSelectedPriorities((prev) => toggleSet(prev, p))}>×</button>
                </span>
              ))}
            </div>
          )}

          {/* Sub-recipe cards list */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-20" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 py-20 text-center">
              <p className="text-gray-400 text-sm">No sub-recipes match your filters.</p>
              {hasFilters && (
                <button
                  onClick={() => { setSelectedStations(new Set()); setSelectedDays(new Set()); setSelectedPriorities(new Set()); setSearch(''); }}
                  className="mt-2 text-xs text-brand-600 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((sr) => {
                const priority = (sr as any).priority ?? 3;
                const pInfo = PRIORITY_INFO[priority] ?? PRIORITY_INFO[3];
                const yield_w = sr.base_yield_weight;
                const yield_u = (sr as any).base_yield_unit ?? 'Kgs';

                return (
                  <div
                    key={sr.id}
                    onClick={() => router.push(`/sub-recipes/${sr.id}`)}
                    className="bg-white rounded-xl border border-gray-200 px-4 py-3.5 hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      {/* Badges column */}
                      <div className="flex flex-col gap-1 min-w-[80px]">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-mono font-medium">
                          #{sr.sub_recipe_code}
                        </span>
                        {yield_w > 0 && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium">
                            {yield_w} {yield_u}
                          </span>
                        )}
                      </div>

                      {/* Name + station */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 text-sm group-hover:text-brand-700 transition-colors truncate">
                            {sr.name}
                          </p>
                          {sr.station_tag && (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium flex-shrink-0">
                              {sr.station_tag}
                            </span>
                          )}
                          {(sr as any).production_day && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs flex-shrink-0">
                              {(sr as any).production_day}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-gray-400">
                            {sr.components.length} ingredient{sr.components.length !== 1 ? 's' : ''}
                          </span>
                          {(sr as any).is_active === false && (
                            <span className="text-xs text-red-400">Inactive</span>
                          )}
                        </div>
                      </div>

                      {/* Right: priority + cost + actions */}
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${pInfo.color}`}>
                          {pInfo.label}
                        </span>
                        <div className="text-right min-w-[60px]">
                          <p className="text-sm font-semibold text-gray-900">
                            ${sr.computed_cost.toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-400">prod. cost</p>
                        </div>
                        <div
                          className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => router.push(`/sub-recipes/${sr.id}`)}
                            className="px-2.5 py-1 text-xs bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 font-medium transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => handleDelete(sr.id, e)}
                            className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100 font-medium transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
