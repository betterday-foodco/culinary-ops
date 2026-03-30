'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, InventoryRow, InventoryReport, ProductionPlan } from '../../lib/api';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtQty(n: number) {
  return n.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}
function displayCategory(cat: string): string {
  if (cat === 'Frozen') return 'Freezer';
  if (cat === 'Pantry') return 'Dry Storage';
  return cat;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const router = useRouter();

  // ── state ──────────────────────────────────────────────────────────────────
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [report, setReport] = useState<InventoryReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // onHandMap: ingredient id → current on-hand value shown in the input
  const [onHandMap, setOnHandMap] = useState<Record<string, number>>({});
  // changedIds: set of ingredient ids that the user has modified
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filterNeedsOrdering, setFilterNeedsOrdering] = useState(false);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // ── load plans ─────────────────────────────────────────────────────────────
  useEffect(() => {
    api.getProductionPlans().then((ps) => {
      setPlans(ps);
      // Default to the most recent plan
      if (ps.length) setSelectedPlanId(ps[0].id);
    });
  }, []);

  // ── load inventory report when plan changes ────────────────────────────────
  const loadReport = useCallback(async (planId: string) => {
    if (!planId) return;
    setLoadingReport(true);
    setReport(null);
    setOnHandMap({});
    setChangedIds(new Set());
    try {
      const r = await api.getInventoryReport(planId);
      setReport(r);
      // Pre-fill on-hand from saved stock values
      const map: Record<string, number> = {};
      for (const rows of Object.values(r.grouped_by_category)) {
        for (const row of rows) {
          map[row.id] = row.stock;
        }
      }
      setOnHandMap(map);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingReport(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPlanId) loadReport(selectedPlanId);
  }, [selectedPlanId, loadReport]);

  // ── derived rows (with live on-hand overrides) ─────────────────────────────
  const computedCategories = useMemo(() => {
    if (!report) return {};
    const result: Record<string, (InventoryRow & { live_to_order: number; live_cases: number; live_total_cost: number })[]> = {};

    for (const [cat, rows] of Object.entries(report.grouped_by_category)) {
      const computed = rows.map((row) => {
        const onHand = onHandMap[row.id] ?? row.stock;
        const live_to_order = parseFloat(Math.max(0, row.need - onHand).toFixed(3));
        const baseWeight = row.base_weight > 0 ? row.base_weight : 1;
        const live_cases = live_to_order > 0 ? Math.ceil(live_to_order / baseWeight) : 0;
        const live_total_cost = parseFloat((live_cases * row.case_price).toFixed(2));
        return { ...row, live_to_order, live_cases, live_total_cost };
      });

      const filtered = computed.filter((row) => {
        if (filterNeedsOrdering && row.live_to_order === 0) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!row.internal_name.toLowerCase().includes(q) && !row.sku.toLowerCase().includes(q)) return false;
        }
        return true;
      });

      if (filtered.length > 0) result[cat] = filtered;
    }
    return result;
  }, [report, onHandMap, filterNeedsOrdering, search]);

  // Summary totals (live)
  const { liveTotalCost, liveItemsNeedingOrder } = useMemo(() => {
    if (!report) return { liveTotalCost: 0, liveItemsNeedingOrder: 0 };
    let total = 0;
    let count = 0;
    for (const rows of Object.values(report.grouped_by_category)) {
      for (const row of rows) {
        const onHand = onHandMap[row.id] ?? row.stock;
        const live_to_order = Math.max(0, row.need - onHand);
        const baseWeight = row.base_weight > 0 ? row.base_weight : 1;
        const live_cases = live_to_order > 0 ? Math.ceil(live_to_order / baseWeight) : 0;
        total += live_cases * row.case_price;
        if (live_to_order > 0) count++;
      }
    }
    return { liveTotalCost: total * 1.04, liveItemsNeedingOrder: count };
  }, [report, onHandMap]);

  // ── handlers ───────────────────────────────────────────────────────────────
  function handleOnHandChange(id: string, value: string) {
    const n = parseFloat(value);
    setOnHandMap((prev) => ({ ...prev, [id]: isNaN(n) ? 0 : n }));
    setChangedIds((prev) => new Set(prev).add(id));
    setSaveMsg(null);
  }

  async function handleSaveCount() {
    if (!report || changedIds.size === 0) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updates = Array.from(changedIds).map((id) => ({
        id,
        stock: onHandMap[id] ?? 0,
      }));
      await api.updateIngredientStockBulk(updates);
      setChangedIds(new Set());
      setSaveMsg({ ok: true, text: `Saved ${updates.length} stock values` });
      // Refresh report to sync server values
      await loadReport(selectedPlanId);
    } catch (e: any) {
      setSaveMsg({ ok: false, text: e.message ?? 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  // ── GFS order sheet export ─────────────────────────────────────────────────
  function exportGFSOrder() {
    if (!report) return;
    const allRows = Object.entries(report.grouped_by_category).flatMap(([cat, rows]) =>
      rows.map((row) => ({ ...row, cat }))
    );
    const filtered = lowStockOnly
      ? allRows.filter((row) => {
          const onHand = onHandMap[row.id] ?? row.stock;
          return (row.need - onHand) > 0;
        })
      : allRows;

    const headers = ['Item Name', 'Category', 'Current Stock', 'Unit', 'Need', 'To Order', 'Cases', 'Unit Cost ($)', 'Case Price ($)', 'SKU', 'Supplier', 'Notes'];
    const rows = filtered.map((row) => {
      const onHand = onHandMap[row.id] ?? row.stock;
      const toOrder = Math.max(0, row.need - onHand);
      const cases = toOrder > 0 ? Math.ceil(toOrder / (row.base_weight > 0 ? row.base_weight : 1)) : 0;
      return [
        row.internal_name,
        displayCategory(row.category ?? ''),
        onHand,
        row.unit ?? '',
        row.need,
        toOrder,
        cases,
        row.cost_per_unit?.toFixed(2) ?? '',
        row.case_price?.toFixed(2) ?? '',
        row.sku ?? '',
        row.supplier_name ?? '',
        '',
      ];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gfs-order-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-screen-2xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📦 Inventory Count</h1>
          {report && (
            <p className="text-sm text-gray-500 mt-0.5">
              {report.week_label}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Plan selector */}
          <select
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white shadow-sm"
          >
            {plans.length === 0 && <option value="">No plans yet</option>}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.week_label} ({p.status})
              </option>
            ))}
          </select>

          {/* Vendor Orders link */}
          {report && (
            <button
              onClick={() => router.push(`/inventory/vendors?plan_id=${report.plan_id}`)}
              className="px-3 py-2 text-sm border border-brand-300 text-brand-600 rounded-lg hover:bg-brand-50 transition-colors"
            >
              View Vendor Orders →
            </button>
          )}

          {/* GFS Order Sheet export */}
          {report && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={lowStockOnly}
                  onChange={(e) => setLowStockOnly(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Needs order only
              </label>
              <button
                onClick={exportGFSOrder}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
              >
                📋 Order Sheet
              </button>
            </div>
          )}

          {/* Save Count */}
          <button
            onClick={handleSaveCount}
            disabled={saving || changedIds.size === 0}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : `Save Count${changedIds.size > 0 ? ` (${changedIds.size})` : ''}`}
          </button>
        </div>
      </div>

      {/* Save message */}
      {saveMsg && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${saveMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {saveMsg.text}
        </div>
      )}

      {/* ── Summary bar ── */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Est. Total Cost (4% buf)</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">${fmt(liveTotalCost)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Items Needing Order</p>
            <p className={`text-xl font-bold mt-0.5 ${liveItemsNeedingOrder > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {liveItemsNeedingOrder}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Ingredients</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">
              {Object.values(report.grouped_by_category).reduce((s, r) => s + r.length, 0)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Categories</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">
              {Object.keys(report.grouped_by_category).length}
            </p>
          </div>
        </div>
      )}

      {/* ── Filter bar ── */}
      {report && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setFilterNeedsOrdering(false)}
              className={`px-4 py-2 transition-colors ${!filterNeedsOrdering ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              All Items
            </button>
            <button
              onClick={() => setFilterNeedsOrdering(true)}
              className={`px-4 py-2 transition-colors flex items-center gap-1.5 ${filterNeedsOrdering ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Needs Ordering
              {liveItemsNeedingOrder > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${filterNeedsOrdering ? 'bg-white text-brand-600' : 'bg-red-500 text-white'}`}>
                  {liveItemsNeedingOrder}
                </span>
              )}
            </button>
          </div>
          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ingredient or SKU…"
              className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
            )}
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loadingReport && (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-40 mb-4" />
              {[...Array(3)].map((_, j) => (
                <div key={j} className="h-8 bg-gray-100 rounded mb-2" />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── No plan selected ── */}
      {!loadingReport && !report && plans.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">No production plans found.</p>
          <button
            onClick={() => router.push('/production/new')}
            className="mt-4 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg"
          >
            Create a Production Plan
          </button>
        </div>
      )}

      {/* ── Category tables ── */}
      {!loadingReport && report && Object.keys(computedCategories).length === 0 && (
        <div className="text-center py-16 text-gray-400">
          {filterNeedsOrdering ? 'All ingredients are well-stocked 👍' : 'No ingredients match your search.'}
        </div>
      )}

      {!loadingReport && Object.entries(computedCategories)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, rows]) => {
          const catCost = rows.reduce((s, r) => s + r.live_total_cost, 0);
          const catNeedingOrder = rows.filter((r) => r.live_to_order > 0).length;
          return (
            <div key={cat} className="mb-5 bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Category header */}
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700">{displayCategory(cat)}</span>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{rows.length} items</span>
                  {catNeedingOrder > 0 && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs font-medium">
                      {catNeedingOrder} to order
                    </span>
                  )}
                </div>
                {catCost > 0 && (
                  <span className="text-sm font-semibold text-gray-700">${fmt(catCost)}</span>
                )}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Need</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">On Hand</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">To Order</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Case Size</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Cases</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Case Price</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((row) => {
                      const hasChanged = changedIds.has(row.id);
                      const needsOrder = row.live_to_order > 0;
                      return (
                        <tr key={row.id} className={`hover:bg-gray-50/50 ${hasChanged ? 'bg-amber-50/30' : ''}`}>
                          {/* Ingredient */}
                          <td className="px-4 py-2.5">
                            <div className="leading-tight">
                              <a href={`/ingredients/${row.id}`} className="font-medium text-blue-600 hover:underline">{row.internal_name}</a>
                            </div>
                            <div className="font-mono text-xs text-gray-400">{row.sku}</div>
                          </td>
                          {/* Need */}
                          <td className="px-4 py-2.5 text-right text-gray-600">
                            {fmtQty(row.need)} <span className="text-xs text-gray-400">{row.unit}</span>
                          </td>
                          {/* On Hand (editable) */}
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                min="0"
                                step="0.001"
                                value={onHandMap[row.id] ?? row.stock}
                                onChange={(e) => handleOnHandChange(row.id, e.target.value)}
                                className={`w-24 text-right text-sm px-2 py-1 border rounded-md ${hasChanged ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'} focus:outline-none focus:ring-1 focus:ring-brand-400`}
                              />
                              <span className="text-xs text-gray-400">{row.unit}</span>
                            </div>
                          </td>
                          {/* To Order */}
                          <td className={`px-4 py-2.5 text-right font-semibold ${needsOrder ? 'text-red-600' : 'text-gray-300'}`}>
                            {needsOrder ? <>{fmtQty(row.live_to_order)} <span className="text-xs font-normal">{row.unit}</span></> : '—'}
                          </td>
                          {/* Case Size */}
                          <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                            {fmtQty(row.base_weight)} {row.unit}
                          </td>
                          {/* Cases */}
                          <td className={`px-4 py-2.5 text-right font-semibold ${row.live_cases > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                            {row.live_cases > 0 ? row.live_cases : '—'}
                          </td>
                          {/* Case Price */}
                          <td className="px-4 py-2.5 text-right text-gray-500">
                            {row.case_price > 0 ? `$${fmt(row.case_price)}` : '—'}
                          </td>
                          {/* Total Cost */}
                          <td className={`px-4 py-2.5 text-right font-bold ${row.live_total_cost > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                            {row.live_total_cost > 0 ? `$${fmt(row.live_total_cost)}` : '—'}
                          </td>
                          {/* Vendor */}
                          <td className="px-4 py-2.5 text-xs text-gray-500">
                            {row.supplier_name ?? <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

      {/* ── Bottom CTA when there are items to order ── */}
      {report && liveItemsNeedingOrder > 0 && (
        <div className="mt-6 p-4 bg-brand-50 border border-brand-200 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-brand-800">
              {liveItemsNeedingOrder} item{liveItemsNeedingOrder !== 1 ? 's' : ''} need to be ordered
            </p>
            <p className="text-xs text-brand-600 mt-0.5">
              Est. total (with 4% buffer): ${fmt(liveTotalCost)}
            </p>
          </div>
          <button
            onClick={() => router.push(`/inventory/vendors?plan_id=${report.plan_id}`)}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors"
          >
            Generate Vendor Orders →
          </button>
        </div>
      )}
    </div>
  );
}
