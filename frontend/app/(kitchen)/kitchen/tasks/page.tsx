'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../../lib/api';

const DAYS = ['wednesday', 'thursday', 'friday'] as const;
const DAY_LABEL: Record<string, string> = { wednesday: '🔵 Wednesday', thursday: '🟢 Thursday', friday: '🟠 Friday' };

export default function DailyTasksPage() {
  const [items, setItems] = useState<any[]>([]);
  const [day, setDay] = useState<string>('wednesday');
  const [loading, setLoading] = useState(true);
  const [weekLabel, setWeekLabel] = useState('');

  useEffect(() => {
    api.getCurrentProductionPlan().then(p => setWeekLabel(p?.week_label ?? new Date().toLocaleDateString())).catch(() => {
      setWeekLabel(new Date().toLocaleDateString());
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDailyChecklist(day);
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => { load(); }, [load]);

  // Auto-seed on first load if empty
  useEffect(() => {
    if (!loading && items.length === 0) {
      api.seedDailyChecklist().then(load).catch(() => {});
    }
  }, [loading, items.length, load]);

  async function handleToggle(item: any) {
    if (!weekLabel) return;
    await api.toggleDailyChecklist(item.id, weekLabel).catch(() => {});
    load();
  }

  const completed = items.filter(i => i.completions?.length > 0).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">📋 Daily Station Checklist</h1>
        <p className="text-sm text-slate-500 mt-1">Complete before starting production · {weekLabel}</p>
      </div>

      {/* Day tabs */}
      <div className="flex gap-2 mb-6">
        {DAYS.map(d => (
          <button key={d} onClick={() => setDay(d)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${day === d ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {DAY_LABEL[d]}
          </button>
        ))}
      </div>

      {/* Progress */}
      {!loading && items.length > 0 && (
        <div className="mb-4 bg-slate-50 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm text-slate-600">{completed} of {items.length} completed</span>
          <div className="w-32 bg-slate-200 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${(completed / items.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Checklist */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center text-slate-400 py-10">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-slate-400 py-10">No checklist items for this day. Admin can add items in Checklist Manage.</div>
        ) : items.map(item => {
          const isDone = item.completions?.length > 0;
          return (
            <label key={item.id} className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${isDone ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
              <input type="checkbox" checked={isDone} onChange={() => handleToggle(item)}
                className="w-5 h-5 mt-0.5 rounded accent-green-600 cursor-pointer flex-shrink-0" />
              <div className="flex-1">
                <span className={`text-sm font-medium ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>{item.title}</span>
                {item.station && <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{item.station}</span>}
                {isDone && item.completions?.[0]?.completed_by && (
                  <div className="text-xs text-green-600 mt-0.5">&#10003; {item.completions[0].completed_by}</div>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
