'use client';

import { useEffect, useState, useRef } from 'react';
import { api, type MealRecipe, type MenuQueueItem, type MenuQueueResponse, type QueueColumn as QueueColumnDef, type MenuAdvanceLog } from '../../lib/api';

const COLUMN_COLORS: Record<string, string> = {
  meat:  'bg-red-50 border-red-200',
  omni:  'bg-orange-50 border-orange-200',
  vegan: 'bg-green-50 border-green-200',
};

const COLUMN_BADGE: Record<string, string> = {
  meat:  'bg-red-100 text-red-700',
  omni:  'bg-orange-100 text-orange-700',
  vegan: 'bg-green-100 text-green-700',
};

const COLUMN_HEADER: Record<string, string> = {
  meat:  'text-red-700',
  omni:  'text-orange-700',
  vegan: 'text-green-700',
};

export default function MenuBuilderPage() {
  const [queueData, setQueueData] = useState<MenuQueueResponse | null>(null);
  const [meals, setMeals] = useState<MealRecipe[]>([]);
  const [lastAdvanced, setLastAdvanced] = useState<MenuAdvanceLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Pool search + filter
  const [poolSearch, setPoolSearch] = useState('');
  const [poolCategory, setPoolCategory] = useState('');
  const [poolOpen, setPoolOpen] = useState(false);

  // Add meal modal
  const [addModal, setAddModal] = useState<{ columnId: string; label: string } | null>(null);
  const [addSearch, setAddSearch] = useState('');

  // Advance modal
  const [advanceModal, setAdvanceModal] = useState(false);
  const [advanceLabel, setAdvanceLabel] = useState('');

  // Edit repeat_weeks inline
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editRepeat, setEditRepeat] = useState('');

  // Drag state
  const dragItem = useRef<{ columnId: string; itemId: string; index: number } | null>(null);
  const dragOver = useRef<{ columnId: string; index: number } | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [qRes, mRes, laRes] = await Promise.allSettled([
        api.getMenuQueue(),
        api.getMeals(),
        api.getLastAdvanced(),
      ]);
      if (qRes.status === 'fulfilled') setQueueData(qRes.value);
      else setError('Menu queue not available — run: npx prisma db push (from backend folder) then restart the server.');
      if (mRes.status === 'fulfilled') setMeals(mRes.value);
      if (laRes.status === 'fulfilled') setLastAdvanced(laRes.value);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToColumn(columnId: string, mealId: string) {
    setSaving(true);
    try {
      await api.addToQueue({ column_id: columnId, meal_id: mealId });
      const q = await api.getMenuQueue();
      setQueueData(q);
      setAddModal(null);
      setAddSearch('');
    } catch (e: any) {
      alert(e.message ?? 'Error adding meal');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(itemId: string) {
    if (!confirm('Remove this meal from the queue?')) return;
    setSaving(true);
    try {
      await api.removeFromQueue(itemId);
      const q = await api.getMenuQueue();
      setQueueData(q);
    } catch (e: any) {
      alert(e.message ?? 'Error removing');
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveUp(columnId: string, index: number) {
    if (!queueData || index === 0) return;
    const items = [...queueData.queue[columnId]];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    await saveColumnOrder(columnId, items);
  }

  async function handleMoveDown(columnId: string, index: number) {
    if (!queueData) return;
    const items = [...queueData.queue[columnId]];
    if (index >= items.length - 1) return;
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    await saveColumnOrder(columnId, items);
  }

  async function saveColumnOrder(columnId: string, items: MenuQueueItem[]) {
    setSaving(true);
    try {
      const result = await api.reorderQueueColumn(columnId, items.map((i) => i.id));
      setQueueData(result);
    } catch (e: any) {
      alert(e.message ?? 'Reorder failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateRepeat(itemId: string) {
    const rw = parseInt(editRepeat);
    if (isNaN(rw) || rw < 1) return;
    setSaving(true);
    try {
      await api.updateQueueItem(itemId, { repeat_weeks: rw });
      const q = await api.getMenuQueue();
      setQueueData(q);
      setEditingItem(null);
    } catch (e: any) {
      alert(e.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvance() {
    setSaving(true);
    try {
      const result = await api.advanceMenuQueue({ week_label: advanceLabel || undefined });
      setQueueData(result.queue);
      setLastAdvanced(result.log);
      setAdvanceModal(false);
      setAdvanceLabel('');
    } catch (e: any) {
      alert(e.message ?? 'Advance failed');
    } finally {
      setSaving(false);
    }
  }

  // Drag handlers
  function onDragStart(columnId: string, itemId: string, index: number) {
    dragItem.current = { columnId, itemId, index };
  }

  function onDragEnter(columnId: string, index: number) {
    dragOver.current = { columnId, index };
  }

  async function onDragEnd() {
    if (!dragItem.current || !dragOver.current) { dragItem.current = null; dragOver.current = null; return; }
    if (!queueData) return;

    const from = dragItem.current;
    const to = dragOver.current;

    // Only reorder within same column
    if (from.columnId === to.columnId && from.index !== to.index) {
      const items = [...queueData.queue[from.columnId]];
      const [moved] = items.splice(from.index, 1);
      items.splice(to.index, 0, moved);
      await saveColumnOrder(from.columnId, items);
    }

    dragItem.current = null;
    dragOver.current = null;
  }

  // Meals not yet in a specific column
  function availableMeals(columnId: string): MealRecipe[] {
    if (!queueData) return [];
    const inQueue = new Set(queueData.queue[columnId].map((i) => i.meal_id));
    return meals.filter((m) => !inQueue.has(m.id));
  }

  // Get all meal IDs already in any column
  const allQueuedMealIds = new Set(
    queueData
      ? Object.values(queueData.queue)
          .flat()
          .map((i) => i.meal_id)
      : [],
  );

  const categories = [...new Set(meals.map((m) => m.category).filter(Boolean) as string[])].sort();

  const poolMeals = meals.filter((m) => {
    if (poolSearch && !m.display_name.toLowerCase().includes(poolSearch.toLowerCase()) &&
        !m.name.toLowerCase().includes(poolSearch.toLowerCase())) return false;
    if (poolCategory && m.category !== poolCategory) return false;
    return true;
  });

  const addSearchFiltered = addModal
    ? availableMeals(addModal.columnId).filter((m) => {
        if (!addSearch) return true;
        return (
          m.display_name.toLowerCase().includes(addSearch.toLowerCase()) ||
          m.name.toLowerCase().includes(addSearch.toLowerCase())
        );
      })
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading menu builder…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-3">{error}</p>
          <button onClick={loadAll} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const columns = queueData?.columns ?? [];
  const queue = queueData?.queue ?? {};

  // Group columns by type
  const meatCols = columns.filter((c) => c.type === 'meat');
  const omniCols = columns.filter((c) => c.type === 'omni');
  const veganCols = columns.filter((c) => c.type === 'vegan');

  const totalSlots = columns.length;
  const filledSlots = columns.filter((c) => (queue[c.id]?.length ?? 0) > 0).length;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Menu Builder</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filledSlots}/{totalSlots} slots filled
            {lastAdvanced && (
              <span className="ml-3 text-gray-400">
                Last advanced: {new Date(lastAdvanced.advanced_at).toLocaleDateString()}
                {lastAdvanced.week_label && ` (${lastAdvanced.week_label})`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPoolOpen((o) => !o)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              poolOpen
                ? 'bg-brand-50 border-brand-300 text-brand-700'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            🍽 Meal Pool ({meals.length})
          </button>
          <button
            onClick={() => setAdvanceModal(true)}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            ▶ Advance Week
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main queue area */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-4">
          {/* Section: Meat */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-red-700 uppercase tracking-wide">Meat</span>
              <span className="text-xs text-gray-400">({meatCols.length} slots)</span>
            </div>
            <div className="flex gap-3 min-w-max">
              {meatCols.map((col) => (
                <QueueColumn
                  key={col.id}
                  col={col}
                  items={queue[col.id] ?? []}
                  onAdd={() => setAddModal({ columnId: col.id, label: col.label })}
                  onRemove={handleRemove}
                  onMoveUp={(idx) => handleMoveUp(col.id, idx)}
                  onMoveDown={(idx) => handleMoveDown(col.id, idx)}
                  onDragStart={onDragStart}
                  onDragEnter={onDragEnter}
                  onDragEnd={onDragEnd}
                  onEditRepeat={(id, rw) => { setEditingItem(id); setEditRepeat(String(rw)); }}
                  editingItem={editingItem}
                  editRepeat={editRepeat}
                  setEditRepeat={setEditRepeat}
                  onSaveRepeat={handleUpdateRepeat}
                  onCancelEdit={() => setEditingItem(null)}
                  colorClass={COLUMN_COLORS['meat']}
                  badgeClass={COLUMN_BADGE['meat']}
                  headerClass={COLUMN_HEADER['meat']}
                />
              ))}
            </div>
          </div>

          {/* Section: Omni */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-orange-700 uppercase tracking-wide">Omnivore</span>
              <span className="text-xs text-gray-400">({omniCols.length} slots)</span>
            </div>
            <div className="flex gap-3 min-w-max">
              {omniCols.map((col) => (
                <QueueColumn
                  key={col.id}
                  col={col}
                  items={queue[col.id] ?? []}
                  onAdd={() => setAddModal({ columnId: col.id, label: col.label })}
                  onRemove={handleRemove}
                  onMoveUp={(idx) => handleMoveUp(col.id, idx)}
                  onMoveDown={(idx) => handleMoveDown(col.id, idx)}
                  onDragStart={onDragStart}
                  onDragEnter={onDragEnter}
                  onDragEnd={onDragEnd}
                  onEditRepeat={(id, rw) => { setEditingItem(id); setEditRepeat(String(rw)); }}
                  editingItem={editingItem}
                  editRepeat={editRepeat}
                  setEditRepeat={setEditRepeat}
                  onSaveRepeat={handleUpdateRepeat}
                  onCancelEdit={() => setEditingItem(null)}
                  colorClass={COLUMN_COLORS['omni']}
                  badgeClass={COLUMN_BADGE['omni']}
                  headerClass={COLUMN_HEADER['omni']}
                />
              ))}
            </div>
          </div>

          {/* Section: Vegan */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-green-700 uppercase tracking-wide">Vegan / Plant-Based</span>
              <span className="text-xs text-gray-400">({veganCols.length} slot)</span>
            </div>
            <div className="flex gap-3 min-w-max">
              {veganCols.map((col) => (
                <QueueColumn
                  key={col.id}
                  col={col}
                  items={queue[col.id] ?? []}
                  onAdd={() => setAddModal({ columnId: col.id, label: col.label })}
                  onRemove={handleRemove}
                  onMoveUp={(idx) => handleMoveUp(col.id, idx)}
                  onMoveDown={(idx) => handleMoveDown(col.id, idx)}
                  onDragStart={onDragStart}
                  onDragEnter={onDragEnter}
                  onDragEnd={onDragEnd}
                  onEditRepeat={(id, rw) => { setEditingItem(id); setEditRepeat(String(rw)); }}
                  editingItem={editingItem}
                  editRepeat={editRepeat}
                  setEditRepeat={setEditRepeat}
                  onSaveRepeat={handleUpdateRepeat}
                  onCancelEdit={() => setEditingItem(null)}
                  colorClass={COLUMN_COLORS['vegan']}
                  badgeClass={COLUMN_BADGE['vegan']}
                  headerClass={COLUMN_HEADER['vegan']}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Meal pool sidebar */}
        {poolOpen && (
          <aside className="w-72 border-l border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Meal Pool</span>
                <button onClick={() => setPoolOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              </div>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 mb-2"
                placeholder="Search meals…"
                value={poolSearch}
                onChange={(e) => setPoolSearch(e.target.value)}
              />
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                value={poolCategory}
                onChange={(e) => setPoolCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {poolMeals.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No meals found</p>
              ) : (
                poolMeals.map((meal) => (
                  <div
                    key={meal.id}
                    className={`p-2 mb-1 rounded-lg border text-sm cursor-default ${
                      allQueuedMealIds.has(meal.id)
                        ? 'border-gray-100 bg-gray-50 opacity-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium text-gray-800 text-xs leading-snug">{meal.display_name}</div>
                    {meal.category && (
                      <span className="text-xs text-gray-400">{meal.category}</span>
                    )}
                    {allQueuedMealIds.has(meal.id) && (
                      <span className="ml-1 text-xs text-green-600">✓ in queue</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Add meal modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setAddModal(null); setAddSearch(''); }}>
          <div className="bg-white rounded-2xl shadow-xl w-96 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Add meal to {addModal.label}</h3>
                <button onClick={() => { setAddModal(null); setAddSearch(''); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <input
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                placeholder="Search meals…"
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
              />
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {addSearchFiltered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No meals available</p>
              ) : (
                addSearchFiltered.map((meal) => (
                  <button
                    key={meal.id}
                    onClick={() => handleAddToColumn(addModal.columnId, meal.id)}
                    disabled={saving}
                    className="w-full text-left p-3 rounded-xl hover:bg-brand-50 transition-colors mb-1 border border-transparent hover:border-brand-200"
                  >
                    <div className="font-medium text-gray-800 text-sm">{meal.display_name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{meal.category ?? 'No category'}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Advance modal */}
      {advanceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setAdvanceModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-80 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-1">Advance Queue</h3>
            <p className="text-sm text-gray-500 mb-4">
              Rotates each column — the top meal moves to the bottom. This represents serving that meal this week.
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Week label (optional)</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="e.g. Week of Mar 24"
              value={advanceLabel}
              onChange={(e) => setAdvanceLabel(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setAdvanceModal(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAdvance}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? 'Advancing…' : 'Advance ▶'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Queue Column sub-component ───────────────────────────────────────────────

interface QueueColumnProps {
  col: QueueColumnDef;
  items: MenuQueueItem[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDragStart: (colId: string, itemId: string, index: number) => void;
  onDragEnter: (colId: string, index: number) => void;
  onDragEnd: () => void;
  onEditRepeat: (id: string, rw: number) => void;
  editingItem: string | null;
  editRepeat: string;
  setEditRepeat: (v: string) => void;
  onSaveRepeat: (id: string) => void;
  onCancelEdit: () => void;
  colorClass: string;
  badgeClass: string;
  headerClass: string;
}

function QueueColumn({
  col, items, onAdd, onRemove, onMoveUp, onMoveDown,
  onDragStart, onDragEnter, onDragEnd,
  onEditRepeat, editingItem, editRepeat, setEditRepeat, onSaveRepeat, onCancelEdit,
  colorClass, badgeClass, headerClass,
}: QueueColumnProps) {
  return (
    <div className={`w-44 border rounded-xl flex flex-col ${colorClass}`} style={{ minHeight: 200 }}>
      {/* Column header */}
      <div className={`px-3 py-2 border-b ${colorClass.replace('bg-', 'border-').split(' ')[1]}`}>
        <div className={`text-xs font-bold uppercase tracking-wide ${headerClass}`}>{col.label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{items.length} meal{items.length !== 1 ? 's' : ''}</div>
      </div>

      {/* This week badge */}
      {items.length > 0 && (
        <div className="px-2 pt-1.5 pb-0.5">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${badgeClass}`}>
            This week ↓
          </span>
        </div>
      )}

      {/* Items */}
      <div className="flex-1 p-2 space-y-1.5">
        {items.map((item, idx) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => onDragStart(col.id, item.id, idx)}
            onDragEnter={() => onDragEnter(col.id, idx)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => e.preventDefault()}
            className={`bg-white rounded-lg border border-gray-200 shadow-sm p-2 cursor-grab active:cursor-grabbing ${
              idx === 0 ? 'ring-2 ring-offset-1 ring-brand-400' : ''
            }`}
          >
            {/* Position badge */}
            <div className="flex items-start justify-between gap-1 mb-1">
              <span className={`text-xs font-bold rounded px-1 ${
                idx === 0 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {idx === 0 ? '★' : `#${idx + 1}`}
              </span>
              <button
                onClick={() => onRemove(item.id)}
                className="text-gray-300 hover:text-red-500 text-xs leading-none flex-shrink-0"
                title="Remove"
              >
                ✕
              </button>
            </div>

            {/* Meal name */}
            <div className="text-xs font-medium text-gray-800 leading-tight mb-1.5" title={item.meal.display_name}>
              {item.meal.display_name.length > 35
                ? item.meal.display_name.slice(0, 33) + '…'
                : item.meal.display_name}
            </div>

            {/* Repeat weeks */}
            {editingItem === item.id ? (
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="number"
                  min={1}
                  className="w-12 border border-gray-300 rounded px-1 py-0.5 text-xs"
                  value={editRepeat}
                  onChange={(e) => setEditRepeat(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSaveRepeat(item.id); if (e.key === 'Escape') onCancelEdit(); }}
                  autoFocus
                />
                <button onClick={() => onSaveRepeat(item.id)} className="text-xs text-green-600 font-medium">✓</button>
                <button onClick={onCancelEdit} className="text-xs text-gray-400">✕</button>
              </div>
            ) : (
              <button
                onClick={() => onEditRepeat(item.id, item.repeat_weeks)}
                className="text-xs text-gray-400 hover:text-gray-600 block"
                title="Click to edit repeat frequency"
              >
                ↻ every {item.repeat_weeks}w
              </button>
            )}

            {/* Up/Down controls */}
            <div className="flex gap-1 mt-1.5">
              <button
                onClick={() => onMoveUp(idx)}
                disabled={idx === 0}
                className="flex-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 py-0.5"
              >
                ↑
              </button>
              <button
                onClick={() => onMoveDown(idx)}
                disabled={idx === items.length - 1}
                className="flex-1 text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 py-0.5"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add button */}
      <div className="p-2 pt-0">
        <button
          onClick={onAdd}
          className="w-full py-1.5 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 text-xs font-medium transition-colors"
        >
          + Add meal
        </button>
      </div>
    </div>
  );
}
