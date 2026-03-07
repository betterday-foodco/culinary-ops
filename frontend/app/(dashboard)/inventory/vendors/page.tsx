'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, InventoryReport, InventoryRow } from '../../../lib/api';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtQty(n: number) {
  return n.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

// Row extended with live ordering math
interface VendorRow extends InventoryRow {
  live_to_order: number;
  live_cases: number;
  live_full_cases: number;
  live_partial_cases: number;
  live_total_cost: number;
}

// ── component ─────────────────────────────────────────────────────────────────

function VendorOrdersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('plan_id') ?? '';

  const [report, setReport] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!planId) {
      setError('No plan selected. Go back and select a production plan.');
      setLoading(false);
      return;
    }
    api.getInventoryReport(planId)
      .then(setReport)
      .catch((e) => setError(e.message ?? 'Failed to load inventory'))
      .finally(() => setLoading(false));
  }, [planId]);

  // Build vendor-grouped structure from inventory report
  const vendorData = useMemo(() => {
    if (!report) return null;

    const allRows: VendorRow[] = [];
    for (const rows of Object.values(report.grouped_by_category)) {
      for (const row of rows) {
        const live_to_order = parseFloat(Math.max(0, row.to_order).toFixed(3));
        const baseWeight = row.base_weight > 0 ? row.base_weight : 1;
        const live_cases = live_to_order > 0 ? Math.ceil(live_to_order / baseWeight) : 0;
        if (live_cases === 0) continue; // skip items not needing ordering
        const live_full_cases = Math.floor(live_to_order / baseWeight);
        const live_partial_cases = parseFloat(((live_to_order % baseWeight) / baseWeight).toFixed(3));
        const live_total_cost = parseFloat((live_cases * row.case_price).toFixed(2));
        allRows.push({ ...row, live_to_order, live_cases, live_full_cases, live_partial_cases, live_total_cost });
      }
    }

    // Group by supplier_name
    const vendors: Record<string, VendorRow[]> = {};
    const missingSkuRows: VendorRow[] = [];

    for (const row of allRows) {
      const vendor = row.supplier_name ?? 'Unknown Vendor';
      if (!vendors[vendor]) vendors[vendor] = [];
      vendors[vendor].push(row);
      if (!row.sku) missingSkuRows.push(row);
    }

    const vendorNames = Object.keys(vendors).sort();
    const totalCostAll = allRows.reduce((s, r) => s + r.live_total_cost, 0);
    const totalCostBuffered = totalCostAll * 1.04;
    const totalItems = allRows.length;

    return { vendors, vendorNames, missingSkuRows, totalCostAll, totalCostBuffered, totalItems };
  }, [report]);

  // ── print a single vendor section ─────────────────────────────────────────
  function printVendor(vendorName: string) {
    const el = document.getElementById(`vendor-section-${vendorName.replace(/[^a-z0-9]/gi, '_')}`);
    if (!el) return;
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) return;
    printWin.document.write(`
      <html>
        <head>
          <title>${vendorName} Order — ${report?.week_label ?? ''}</title>
          <style>
            body { font-family: sans-serif; font-size: 12px; margin: 24px; color: #111; }
            h2 { font-size: 16px; margin-bottom: 4px; }
            p  { font-size: 11px; color: #555; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
            th { background: #f5f5f5; font-weight: 600; font-size: 11px; text-transform: uppercase; }
            tr:nth-child(even) { background: #fafafa; }
            .num { text-align: right; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; background: #e0f2fe; color: #0369a1; }
          </style>
        </head>
        <body>
          <h2>${vendorName} — Order List</h2>
          <p>${report?.week_label ?? ''} &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString('en-CA')}</p>
          ${el.innerHTML}
        </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    printWin.print();
    printWin.close();
  }

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-48 mb-4" />
            {[...Array(4)].map((_, j) => <div key={j} className="h-7 bg-gray-100 rounded mb-2" />)}
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center py-20">
        <p className="text-red-600 font-medium">{error}</p>
        <button onClick={() => router.back()} className="mt-4 px-4 py-2 border border-gray-300 rounded-lg text-sm">
          ← Go Back
        </button>
      </div>
    );
  }

  if (!vendorData) return null;

  const { vendors, vendorNames, missingSkuRows, totalCostBuffered, totalItems } = vendorData;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => router.push(`/inventory?plan_id=${planId}`)}
            className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
          >
            ← Back to Inventory
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Orders</h1>
          {report && (
            <p className="text-sm text-gray-500 mt-0.5">{report.week_label}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-sm text-gray-500">{totalItems} items across {vendorNames.length} vendor{vendorNames.length !== 1 ? 's' : ''}</p>
          <p className="text-lg font-bold text-gray-900">
            Total (4% buffer): <span className="text-brand-600">${fmt(totalCostBuffered)}</span>
          </p>
        </div>
      </div>

      {vendorNames.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">🎉 Nothing to order this week!</p>
          <p className="text-sm mt-2">All ingredients are sufficiently stocked based on current counts.</p>
        </div>
      )}

      {/* ── Per-vendor sections ── */}
      {vendorNames.map((vendorName) => {
        const rows = vendors[vendorName];
        const vendorTotal = rows.reduce((s, r) => s + r.live_total_cost, 0);
        const domId = `vendor-section-${vendorName.replace(/[^a-z0-9]/gi, '_')}`;

        return (
          <div key={vendorName} className="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Vendor header */}
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-gray-800">{vendorName}</span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{rows.length} items</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-700">${fmt(vendorTotal)}</span>
                <button
                  onClick={() => printVendor(vendorName)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  🖨 Print
                </button>
              </div>
            </div>

            {/* Printable table */}
            <div id={domId} className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Vendor SKU</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Need</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">On Hand</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">To Order</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Full Cases</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Partial</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Case Price</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.sort((a, b) => a.internal_name.localeCompare(b.internal_name)).map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900 leading-tight">{row.internal_name}</div>
                        {row.display_name !== row.internal_name && (
                          <div className="text-xs text-gray-400">{row.display_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                        {row.sku || <span className="text-red-400 font-medium">MISSING</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {fmtQty(row.need)} <span className="text-xs text-gray-400">{row.unit}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {fmtQty(row.stock)} <span className="text-xs text-gray-400">{row.unit}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-red-600">
                        {fmtQty(row.live_to_order)} <span className="text-xs font-normal text-gray-400">{row.unit}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                        {row.live_full_cases > 0 ? row.live_full_cases : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500">
                        {row.live_partial_cases > 0 ? fmtQty(row.live_partial_cases) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {row.case_price > 0 ? `$${fmt(row.case_price)}` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                        ${fmt(row.live_total_cost)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{row.category}</td>
                    </tr>
                  ))}
                </tbody>
                {/* Vendor subtotal */}
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td colSpan={8} className="px-4 py-2.5 text-sm font-semibold text-gray-700">
                      {vendorName} subtotal ({rows.length} items)
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                      ${fmt(vendorTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      {/* ── Missing SKU section ── */}
      {missingSkuRows.length > 0 && (
        <div className="mb-6 bg-red-50 rounded-xl border border-red-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-red-200 flex items-center gap-3">
            <span className="text-base font-bold text-red-700">⚠️ Missing SKU — Fill In Before Ordering</span>
            <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs">{missingSkuRows.length} items</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-red-50/50 border-b border-red-100">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-red-500 uppercase">Ingredient</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-red-500 uppercase">To Order</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-red-500 uppercase">Cases</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-red-500 uppercase">Vendor</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-red-500 uppercase">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-50">
                {missingSkuRows.map((row) => (
                  <tr key={row.id} className="hover:bg-red-50/50">
                    <td className="px-4 py-2.5 font-medium text-red-800">{row.internal_name}</td>
                    <td className="px-4 py-2.5 text-right text-red-700">
                      {fmtQty(row.live_to_order)} {row.unit}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-700">{row.live_cases}</td>
                    <td className="px-4 py-2.5 text-xs text-red-600">{row.supplier_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-red-600">{row.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Grand total footer ── */}
      {vendorNames.length > 0 && (
        <div className="bg-gray-900 text-white rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm text-gray-300">{totalItems} items · {vendorNames.length} vendors</p>
            <p className="text-xs text-gray-500 mt-0.5">Prices do not include tax or shipping</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Subtotal: ${fmt(vendorData.totalCostAll)}</p>
            <p className="text-xl font-bold">
              Total (4% buffer): ${fmt(totalCostBuffered)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VendorOrdersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Loading...</div>}>
      <VendorOrdersInner />
    </Suspense>
  );
}
