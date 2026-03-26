'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, KitchenFeedback } from '../../lib/api';

const STATION_EMOJI: Record<string, string> = {
  'Veg Station': '🥬', 'Protein Station': '🥩', 'Sauce Station': '🫕',
  'Oven Station': '🔥', 'Breakfast + Sides Station': '🍳', 'Packaging Station': '📦',
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-400 text-sm">
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  );
}

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<KitchenFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'new' | 'fixed'>('new');
  const [selected, setSelected] = useState<KitchenFeedback | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAllKitchenFeedback();
      setFeedback(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openFeedback(fb: KitchenFeedback) {
    setSelected(fb);
    setAdminNotes(fb.admin_notes ?? '');
  }

  async function saveNotes() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await api.updateKitchenFeedback(selected.id, { admin_notes: adminNotes });
      setFeedback(prev => prev.map(f => f.id === updated.id ? updated : f));
      setSelected(updated);
    } catch (e: any) {
      alert(e.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function toggleFixed() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await api.updateKitchenFeedback(selected.id, { is_fixed: !selected.is_fixed });
      setFeedback(prev => prev.map(f => f.id === updated.id ? updated : f));
      setSelected(updated);
    } catch (e: any) {
      alert(e.message ?? 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  const filtered = feedback.filter(f => tab === 'fixed' ? f.is_fixed : !f.is_fixed);

  if (selected) {
    const sr = selected.sub_recipe;
    const station = sr?.station_tag ?? '';
    return (
      <div className="max-w-2xl mx-auto">
        {/* Back */}
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 font-medium transition-colors">
          ← Recipe Feedback
        </button>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              {station && (
                <p className="text-xs font-bold text-brand-600 uppercase tracking-widest mb-1">
                  {STATION_EMOJI[station] ?? '🍽'} {station}
                </p>
              )}
              <h1 className="text-xl font-black text-gray-900">{sr?.display_name || sr?.name || 'Recipe'}</h1>
              <div className="flex items-center gap-3 mt-2">
                <StarRating rating={selected.rating} />
                <span className="text-xs text-gray-400">by {selected.user?.name ?? 'Staff'} · {new Date(selected.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              {sr?.id && (
                <Link href={`/sub-recipes/${sr.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  ✏️ Edit Recipe
                </Link>
              )}
              <button
                onClick={toggleFixed}
                disabled={saving}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${selected.is_fixed ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
              >
                {selected.is_fixed ? '✓ Fixed' : '◎ Mark as Fixed'}
              </button>
            </div>
          </div>
        </div>

        {/* Staff Feedback */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Staff Feedback</p>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 font-bold text-sm">
              {(selected.user?.name ?? 'S')[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{selected.user?.name ?? 'Staff'}</p>
              <p className="text-xs text-gray-400">{new Date(selected.created_at).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>
          <StarRating rating={selected.rating} />
          {selected.comment && (
            <div className="mt-3 p-3 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-700 leading-relaxed">{selected.comment}</p>
            </div>
          )}
        </div>

        {/* Chef Edit Notes */}
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 shadow-sm">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3">Chef Edit Notes</p>
          <textarea
            rows={4}
            value={adminNotes}
            onChange={e => setAdminNotes(e.target.value)}
            placeholder="Add notes about this recipe, what needs to change, steps to fix…"
            className="w-full bg-transparent text-sm text-gray-700 focus:outline-none resize-none placeholder:text-amber-300"
          />
          <button
            onClick={saveNotes}
            disabled={saving || adminNotes === (selected.admin_notes ?? '')}
            className="mt-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Notes'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-gray-900">Recipe Feedback</h1>
          <p className="text-sm text-gray-500 mt-0.5">{feedback.filter(f => !f.is_fixed).length} new · {feedback.filter(f => f.is_fixed).length} fixed</p>
        </div>
        <button onClick={load} className="text-xs text-brand-600 hover:text-brand-700 font-semibold">Refresh</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {(['new', 'fixed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all capitalize ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            {t === 'new' ? `New (${feedback.filter(f => !f.is_fixed).length})` : `Fixed (${feedback.filter(f => f.is_fixed).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 animate-pulse h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">{tab === 'fixed' ? '✅' : '📭'}</p>
          <p className="text-gray-500 font-semibold">{tab === 'fixed' ? 'No fixed recipes yet' : 'No new feedback'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 shadow-sm">
          {filtered.map(fb => {
            const sr = fb.sub_recipe;
            const station = sr?.station_tag ?? '';
            return (
              <button key={fb.id} onClick={() => openFeedback(fb)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${fb.is_fixed ? 'bg-green-100' : 'bg-red-50'}`}>
                  {fb.is_fixed ? '✅' : '⚠️'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{sr?.display_name || sr?.name || 'Recipe'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StarRating rating={fb.rating} />
                    {station && <span className="text-[10px] text-gray-400">{STATION_EMOJI[station]} {station}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fb.user?.name ?? 'Staff'} · {new Date(fb.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <span className="text-gray-300 flex-shrink-0">›</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
