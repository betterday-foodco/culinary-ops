'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ShortageLog, BulkLog } from '../../lib/api';

const STATION_EMOJI: Record<string, string> = {
  'Veg Station': '🥬', 'Protein Station': '🥩', 'Sauce Station': '🫕',
  'Oven Station': '🔥', 'Breakfast + Sides Station': '🍳', 'Packaging Station': '📦',
};

type Tab = 'shortage' | 'bulk';

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>('shortage');
  const [shortages, setShortages] = useState<ShortageLog[]>([]);
  const [bulkLogs, setBulkLogs] = useState<BulkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [editingShortage, setEditingShortage] = useState<string | null>(null);
  const [editThursdayQty, setEditThursdayQty] = useState('');
  const [editingBulk, setEditingBulk] = useState<string | null>(null);
  const [editBulkQty, setEditBulkQty] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([api.getPendingShortages(), api.getPendingBulk()]);
      setShortages(s);
      setBulkLogs(b);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approveShortage(logId: string) {
    setApproving(logId);
    try {
      await api.approveShortage(logId);
      setShortages(prev => prev.filter(s => s.id !== logId));
    } catch (e: any) {
      alert(e.message ?? 'Failed to approve');
    } finally {
      setApproving(null);
    }
  }

  async function approveBulk(logId: string) {
    setApproving(logId);
    try {
      await api.approveBulk(logId);
      setBulkLogs(prev => prev.filter(b => b.id !== logId));
    } catch (e: any) {
      alert(e.message ?? 'Failed to approve');
    } finally {
      setApproving(null);
    }
  }

  async function saveShortageEdit(log: ShortageLog) {
    const qty = parseFloat(editThursdayQty);
    if (isNaN(qty)) return;
    setSaving(log.id);
    try {
      await api.updateProductionLog(log.id, { qty_cooked: qty });
      setEditingShortage(null);
      await load();
    } catch (e: any) {
      alert(e.message ?? 'Failed to save');
    } finally {
      setSaving(null);
    }
  }

  async function saveBulkEdit(log: BulkLog) {
    const qty = parseFloat(editBulkQty);
    if (isNaN(qty)) return;
    setSaving(log.id);
    try {
      await api.updateProductionLog(log.id, { qty_cooked: qty });
      setEditingBulk(null);
      await load();
    } catch (e: any) {
      alert(e.message ?? 'Failed to save');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-gray-900">Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and approve kitchen production exceptions</p>
        </div>
        <button onClick={load} className="text-xs text-brand-600 hover:text-brand-700 font-semibold">Refresh</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-5">
        <button
          onClick={() => setTab('shortage')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'shortage'
              ? 'bg-white text-red-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span>⚠️</span>
          Shortages
          {shortages.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-black px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {shortages.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('bulk')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'bulk'
              ? 'bg-white text-amber-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span>📦</span>
          Bulk Cooking
          {bulkLogs.length > 0 && (
            <span className="bg-amber-500 text-white text-xs font-black px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {bulkLogs.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      ) : tab === 'shortage' ? (
        shortages.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">✅</p>
            <p className="text-gray-600 font-semibold">No pending shortages</p>
            <p className="text-sm text-gray-400 mt-1">All production quantities are on track</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shortages.map(log => {
              const station = log.sub_recipe.station_tag ?? '';
              const emoji = STATION_EMOJI[station] ?? '🍽';
              return (
                <div key={log.id} className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
                  <div className="bg-red-50 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{emoji}</span>
                      <div>
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">{station || 'Kitchen'}</p>
                        <p className="text-sm font-bold text-gray-900">{log.sub_recipe.display_name || log.sub_recipe.name}</p>
                      </div>
                    </div>
                    <span className="bg-red-100 text-red-700 text-xs font-black px-2 py-1 rounded-full">SHORT</span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-5 text-sm mb-3">
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cooked</p>
                        <p className="font-bold text-gray-900">{log.qty_cooked ?? 0} Kgs</p>
                      </div>
                      {log.have_on_hand != null && (
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">On Hand</p>
                          <p className="font-bold text-gray-900">{log.have_on_hand} Kgs</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Reported By</p>
                        <p className="font-bold text-gray-700">{log.user.name ?? 'Staff'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Plan</p>
                        <p className="font-bold text-gray-700">{log.plan.week_label}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {editingShortage === log.id ? (
                        <>
                          <input
                            type="number"
                            value={editThursdayQty}
                            onChange={e => setEditThursdayQty(e.target.value)}
                            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="Qty Kgs"
                          />
                          <button
                            onClick={() => saveShortageEdit(log)}
                            disabled={saving === log.id}
                            className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50"
                          >{saving === log.id ? 'Saving…' : '✓ Save'}</button>
                          <button onClick={() => setEditingShortage(null)} className="px-3 py-2 bg-slate-100 rounded-xl text-sm">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditingShortage(log.id); setEditThursdayQty(String(log.qty_cooked ?? '')); }}
                            className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium"
                          >Edit Qty</button>
                          <button
                            onClick={() => approveShortage(log.id)}
                            disabled={approving === log.id}
                            className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors"
                          >{approving === log.id ? 'Approving…' : '✓ Approve Shortage'}</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        bulkLogs.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">✅</p>
            <p className="text-gray-600 font-semibold">No pending bulk approvals</p>
            <p className="text-sm text-gray-400 mt-1">No over-production has been reported</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bulkLogs.map(log => {
              const station = log.sub_recipe.station_tag ?? '';
              const emoji = STATION_EMOJI[station] ?? '🍽';
              return (
                <div key={log.id} className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                  <div className="bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{emoji}</span>
                      <div>
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{station || 'Kitchen'}</p>
                        <p className="text-sm font-bold text-gray-900">{log.sub_recipe.display_name || log.sub_recipe.name}</p>
                      </div>
                    </div>
                    <span className="bg-amber-100 text-amber-700 text-xs font-black px-2 py-1 rounded-full">BULK</span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-5 text-sm mb-2">
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Qty Cooked</p>
                        <p className="font-bold text-gray-900">{log.qty_cooked ?? 0} Kgs</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cooked By</p>
                        <p className="font-bold text-gray-700">{log.user.name ?? 'Staff'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Plan</p>
                        <p className="font-bold text-gray-700">{log.plan.week_label}</p>
                      </div>
                    </div>
                    {log.bulk_reason && (
                      <div className="bg-amber-50 rounded-xl px-3 py-2 mb-3">
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-0.5">Reason</p>
                        <p className="text-sm text-gray-800">{log.bulk_reason}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      {editingBulk === log.id ? (
                        <>
                          <input
                            type="number"
                            value={editBulkQty}
                            onChange={e => setEditBulkQty(e.target.value)}
                            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="Qty Kgs"
                          />
                          <button
                            onClick={() => saveBulkEdit(log)}
                            disabled={saving === log.id}
                            className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50"
                          >{saving === log.id ? 'Saving…' : '✓ Save'}</button>
                          <button onClick={() => setEditingBulk(null)} className="px-3 py-2 bg-slate-100 rounded-xl text-sm">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditingBulk(log.id); setEditBulkQty(String(log.qty_cooked ?? '')); }}
                            className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium"
                          >Edit Qty</button>
                          <button
                            onClick={() => approveBulk(log.id)}
                            disabled={approving === log.id}
                            className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                          >{approving === log.id ? 'Approving…' : '✓ Approve Bulk Cooking'}</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
