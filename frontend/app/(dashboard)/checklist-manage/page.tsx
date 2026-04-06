'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api';

const DAYS = ['wednesday', 'thursday', 'friday'];
const DAY_LABEL: Record<string, string> = { wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday' };
const DAY_COLOR: Record<string, string> = {
  wednesday: 'bg-blue-50 border-blue-200',
  thursday: 'bg-green-50 border-green-200',
  friday: 'bg-orange-50 border-orange-200',
};

export default function ChecklistManagePage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDay, setNewDay] = useState('wednesday');
  const [newStation, setNewStation] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDailyChecklist();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!newTitle.trim()) return;
    await api.createDailyChecklistItem({ title: newTitle.trim(), day: newDay, station: newStation.trim() || undefined });
    setNewTitle('');
    setNewStation('');
    setAdding(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this checklist item?')) return;
    await api.deleteDailyChecklistItem(id);
    load();
  }

  async function handleEditSave(id: string) {
    if (!editTitle.trim()) return;
    await api.updateDailyChecklistItem(id, { title: editTitle.trim() });
    setEditingId(null);
    load();
  }

  const grouped = DAYS.reduce((acc, d) => {
    acc[d] = items.filter(i => i.day === d);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📋 Checklist Management</h1>
          <p className="text-sm text-slate-500 mt-1">Items are published every week. Station leads check them off on production days.</p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          + Add Item
        </button>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs font-medium text-slate-600 block mb-1">Checklist Item</label>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. Check walk-in cooler temperature"
              autoFocus
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Day</label>
            <select value={newDay} onChange={e => setNewDay(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="wednesday">Wednesday</option>
              <option value="thursday">Thursday</option>
              <option value="friday">Friday</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Station (optional)</label>
            <input
              value={newStation}
              onChange={e => setNewStation(e.target.value)}
              placeholder="All stations"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none"
            />
          </div>
          <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Add</button>
          <button onClick={() => { setAdding(false); setNewTitle(''); setNewStation(''); }} className="px-3 py-2 text-sm text-slate-500">Cancel</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : (
        <div className="space-y-6">
          {DAYS.map(day => (
            <div key={day} className={`border rounded-xl overflow-hidden ${DAY_COLOR[day]}`}>
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">
                  {DAY_LABEL[day]}{' '}
                  <span className="text-sm font-normal text-slate-500">({grouped[day]?.length ?? 0} items)</span>
                </h3>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Published weekly</span>
              </div>
              <div className="bg-white divide-y divide-slate-100">
                {grouped[day]?.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-400">No items for {DAY_LABEL[day]}</div>
                ) : (
                  grouped[day].map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                      <span className="text-xs text-slate-400 w-5">{idx + 1}</span>
                      {editingId === item.id ? (
                        <input
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleEditSave(item.id); if (e.key === 'Escape') setEditingId(null); }}
                          autoFocus
                          className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="flex-1 text-sm text-slate-800">{item.title}</span>
                      )}
                      {item.station && (
                        <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{item.station}</span>
                      )}
                      <div className="flex gap-2 ml-auto">
                        {editingId === item.id ? (
                          <>
                            <button onClick={() => handleEditSave(item.id)} className="text-xs text-blue-600 hover:underline">Save</button>
                            <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:underline">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(item.id); setEditTitle(item.title); }} className="text-xs text-blue-500 hover:underline">Edit</button>
                            <button onClick={() => handleDelete(item.id)} className="text-xs text-red-400 hover:underline">Remove</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
