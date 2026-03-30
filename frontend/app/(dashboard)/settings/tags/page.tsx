'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../../lib/api';

const TAG_TYPES = [
  { id: 'allergens',       label: 'Allergens & Dislikes',   icon: '🚫' },
  { id: 'proteins',        label: 'Protein Types',          icon: '🥩' },
  { id: 'badges',          label: 'Badges & Filters',       icon: '🏷️' },
  { id: 'diets',           label: 'Diet Plans',             icon: '🥗' },
  { id: 'menu-cats',       label: 'Menu Categories',        icon: '📋' },
  { id: 'ingredient-cats', label: 'Ingredient Categories',  icon: '🧂' },
  { id: 'suppliers',       label: 'Suppliers',              icon: '🚚' },
  { id: 'storage',         label: 'Storage Locations',      icon: '📍' },
];

const SOURCE_COLORS: Record<string, string> = {
  ingredient: 'bg-blue-100 text-blue-700',
  dish:       'bg-green-100 text-green-700',
  computed:   'bg-purple-100 text-purple-700',
};

const SUBTYPE_COLORS: Record<string, string> = {
  Allergen: 'bg-red-100 text-red-700',
  Dislike:  'bg-violet-100 text-violet-700',
  Protein:  'bg-amber-100 text-amber-700',
  Filter:   'bg-blue-100 text-blue-700',
  Badge:    'bg-green-100 text-green-700',
  Plan:     'bg-emerald-100 text-emerald-700',
  Category: 'bg-slate-100 text-slate-600',
  Supplier: 'bg-sky-100 text-sky-700',
  Location: 'bg-gray-100 text-gray-600',
};

export default function SystemTagsPage() {
  const [tags, setTags] = useState<any[]>([]);
  const [activeType, setActiveType] = useState('allergens');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSubtype, setNewSubtype] = useState('');
  const [newSource, setNewSource] = useState('dish');
  const [newRule, setNewRule] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTags();
      setTags(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Seed on first load if empty
  useEffect(() => {
    if (!loading && tags.length === 0) {
      api.seedTags().then(load);
    }
  }, [loading, tags.length, load]);

  const filtered = tags.filter((t) => t.type === activeType);
  const typeCounts = tags.reduce((acc: Record<string, number>, t) => {
    acc[t.type] = (acc[t.type] ?? 0) + 1;
    return acc;
  }, {});

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.createTag({
        name: newName.trim(),
        type: activeType,
        subtype: newSubtype || undefined,
        source: newSource,
        rule: newRule.trim() || undefined,
      });
      setNewName('');
      setNewSubtype('');
      setNewRule('');
      setShowAdd(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(tag: any, field: 'visible' | 'label_bold') {
    await api.updateTag(tag.id, { [field]: !tag[field] });
    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, [field]: !t[field] } : t)));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this tag? This cannot be undone.')) return;
    await api.deleteTag(id);
    setTags((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleEditSave(tag: any) {
    if (!editName.trim()) return;
    await api.updateTag(tag.id, { name: editName.trim() });
    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, name: editName.trim() } : t)));
    setEditingId(null);
  }

  return (
    <div className="flex h-full min-h-screen">
      {/* Left sidebar */}
      <div className="w-56 border-r border-slate-200 bg-slate-50 p-4 shrink-0">
        <div className="font-semibold text-slate-700 text-xs mb-3 uppercase tracking-wide">Tag Types</div>
        <div className="space-y-0.5">
          {TAG_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveType(t.id); setShowAdd(false); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                activeType === t.id
                  ? 'bg-white border border-slate-200 shadow-sm text-slate-900 font-medium'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <span className="truncate">{t.icon} {t.label}</span>
              {typeCounts[t.id] != null && (
                <span className="text-[10px] bg-slate-200 text-slate-600 rounded-full px-1.5 ml-1 shrink-0">
                  {typeCounts[t.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">Source Legend</div>
          <div className="space-y-1">
            {Object.entries(SOURCE_COLORS).map(([src, cls]) => (
              <div key={src} className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cls}`}>{src}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {TAG_TYPES.find((t) => t.id === activeType)?.icon}{' '}
              {TAG_TYPES.find((t) => t.id === activeType)?.label}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{filtered.length} tags</p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Add Tag
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-32">
              <label className="text-xs font-medium text-slate-600 block mb-1">Name *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Tag name..."
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Subtype</label>
              <input
                value={newSubtype}
                onChange={(e) => setNewSubtype(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="e.g. Allergen"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Source</label>
              <select
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="dish">Dish (manual)</option>
                <option value="ingredient">Ingredient (rollup)</option>
                <option value="computed">Computed (rule)</option>
              </select>
            </div>
            {newSource === 'computed' && (
              <div className="flex-1 min-w-40">
                <label className="text-xs font-medium text-slate-600 block mb-1">Rule expression</label>
                <input
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="e.g. protein >= 35"
                />
              </div>
            )}
            <button
              onClick={handleAdd}
              disabled={saving || !newName.trim()}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewName(''); setNewSubtype(''); setNewRule(''); }}
              className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Tags table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Subtype</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Client Visible</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Label Bold</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading tags…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No tags in this category yet.{' '}
                    <button onClick={() => setShowAdd(true)} className="text-blue-500 underline">Add one</button>
                  </td>
                </tr>
              ) : (
                filtered.map((tag) => (
                  <tr key={tag.id} className="hover:bg-slate-50 group">
                    {/* Name cell — double-click to edit */}
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {editingId === tag.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleEditSave(tag);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="border border-blue-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-40"
                            autoFocus
                          />
                          <button onClick={() => handleEditSave(tag)} className="text-xs text-blue-600 hover:underline">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className="cursor-pointer hover:text-blue-600"
                            onDoubleClick={() => { setEditingId(tag.id); setEditName(tag.name); }}
                            title="Double-click to edit"
                          >
                            {tag.name}
                          </span>
                          {tag.rule && (
                            <code className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100 font-mono">
                              {tag.rule}
                            </code>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Subtype */}
                    <td className="px-4 py-3">
                      {tag.subtype && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SUBTYPE_COLORS[tag.subtype] ?? 'bg-slate-100 text-slate-600'}`}>
                          {tag.subtype}
                        </span>
                      )}
                    </td>

                    {/* Source */}
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[tag.source] ?? 'bg-gray-100 text-gray-600'}`}>
                        {tag.source}
                      </span>
                    </td>

                    {/* Visible toggle */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(tag, 'visible')}
                        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${tag.visible ? 'bg-green-500' : 'bg-slate-300'}`}
                        title={tag.visible ? 'Visible to clients' : 'Hidden from clients'}
                      >
                        <span
                          className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${tag.visible ? 'translate-x-4' : 'translate-x-0.5'}`}
                        />
                      </button>
                    </td>

                    {/* Label bold toggle */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(tag, 'label_bold')}
                        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${tag.label_bold ? 'bg-blue-500' : 'bg-slate-300'}`}
                        title={tag.label_bold ? 'Label bold on' : 'Label bold off'}
                      >
                        <span
                          className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${tag.label_bold ? 'translate-x-4' : 'translate-x-0.5'}`}
                        />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingId(tag.id); setEditName(tag.name); }}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(tag.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Connections section placeholder */}
        {filtered.some((t) => t.connections_from?.length > 0) && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Tag Connections</h3>
            <div className="space-y-2">
              {filtered.filter((t) => t.connections_from?.length > 0).map((tag) => (
                <div key={tag.id} className="bg-white border border-slate-200 rounded-lg px-4 py-3">
                  <div className="text-sm font-medium text-slate-800 mb-2">{tag.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {tag.connections_from.map((conn: any) => (
                      <span
                        key={conn.id}
                        className="inline-flex items-center gap-1 text-[11px] bg-blue-600 text-white px-2.5 py-1 rounded-md"
                      >
                        <span className="opacity-75">{conn.relationship}</span>
                        <span className="font-bold">{conn.to_tag?.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
