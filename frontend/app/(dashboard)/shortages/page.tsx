'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ShortageLog } from '../../lib/api';

const STATION_EMOJI: Record<string, string> = {
  'Veg Station': '🥬', 'Protein Station': '🥩', 'Sauce Station': '🫕',
  'Oven Station': '🔥', 'Breakfast + Sides Station': '🍳', 'Packaging Station': '📦',
};

export default function ShortagesPage() {
  const [shortages, setShortages] = useState<ShortageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getPendingShortages();
      setShortages(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(logId: string) {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-gray-900">Shortage Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">{shortages.length} pending · Kitchen staff reporting short quantities</p>
        </div>
        <button onClick={load} className="text-xs text-brand-600 hover:text-brand-700 font-semibold">Refresh</button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-gray-200 animate-pulse" />)}
        </div>
      ) : shortages.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-3">✅</p>
          <p className="text-gray-500 font-semibold">No pending shortages</p>
          <p className="text-sm text-gray-400 mt-1">All production quantities are on track</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shortages.map(log => {
            const station = log.sub_recipe.station_tag ?? '';
            const emoji = STATION_EMOJI[station] ?? '🍽';
            return (
              <div key={log.id} className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="bg-red-50 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{emoji}</span>
                    <div>
                      <p className="text-xs font-black text-red-600 uppercase tracking-widest">{station || 'Kitchen'}</p>
                      <p className="text-sm font-bold text-gray-900">{log.sub_recipe.display_name || log.sub_recipe.name}</p>
                    </div>
                  </div>
                  <span className="bg-red-100 text-red-700 text-xs font-black px-2 py-1 rounded-full">SHORT</span>
                </div>

                {/* Details */}
                <div className="px-4 py-3">
                  <div className="flex items-center gap-4 text-sm mb-3">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cooked</p>
                      <p className="font-bold text-gray-900">{log.qty_cooked ?? 0} Kgs</p>
                    </div>
                    {log.have_on_hand != null && (
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Have on Hand</p>
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

                  <button
                    onClick={() => approve(log.id)}
                    disabled={approving === log.id}
                    className="w-full py-2.5 bg-brand-600 text-white rounded-xl text-sm font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    {approving === log.id ? 'Approving…' : '✓ Approve Shortage'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
