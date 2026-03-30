'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, StaffAssignment } from '../../lib/api';

const DEFAULT_STATIONS = [
  'Veg Station', 'Protein Station', 'Sauce Station',
  'Oven Station', 'Breakfast + Sides Station', 'Packaging Station',
];

const STATION_EMOJI: Record<string, string> = {
  'Veg Station': '🥬', 'Protein Station': '🥩', 'Sauce Station': '🫕',
  'Oven Station': '🔥', 'Breakfast + Sides Station': '🍳', 'Packaging Station': '📦',
};

const ROLE_BADGE: Record<string, string> = {
  lead: 'bg-brand-100 text-brand-700',
  prep: 'bg-gray-100 text-gray-500',
};

export default function StationAssignmentPage() {
  const [staff, setStaff] = useState<StaffAssignment[]>([]);
  const [stations, setStations] = useState<string[]>(DEFAULT_STATIONS);
  const [loading, setLoading] = useState(true);
  const [savingStation, setSavingStation] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [showAddStation, setShowAddStation] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [addingStation, setAddingStation] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, stationsData] = await Promise.all([
        api.getStationAssignment(),
        api.getKitchenStations().catch(() => null),
      ]);
      setStaff(data);
      if (stationsData && stationsData.length > 0) {
        setStations(stationsData.map((s: any) => s.name));
      } else {
        // Seed stations if none exist
        api.seedKitchenStations().then(() => api.getKitchenStations()).then(s => {
          if (s?.length) setStations(s.map((st: any) => st.name));
        }).catch(() => {});
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleAddStation() {
    if (!newStationName.trim()) return;
    setAddingStation(true);
    try {
      await api.createKitchenStation({ name: newStationName.trim() });
      const updated = await api.getKitchenStations();
      setStations(updated.map((s: any) => s.name));
      setNewStationName('');
      setShowAddStation(false);
    } catch (e: any) {
      alert(e.message ?? 'Failed to add station');
    } finally {
      setAddingStation(false);
    }
  }

  useEffect(() => { load(); }, [load]);

  async function assignStation(staffId: string, station: string | null) {
    setSavingStation(staffId);
    try {
      const updated = await api.assignStation(staffId, station);
      setStaff(prev => prev.map(s => s.id === staffId ? { ...s, station: updated.station } : s));
    } catch (e: any) {
      alert(e.message ?? 'Failed to assign');
    } finally {
      setSavingStation(null);
    }
  }

  async function assignRole(staffId: string, role: string | null) {
    setSavingRole(staffId);
    try {
      const updated = await api.assignStationRole(staffId, role);
      setStaff(prev => prev.map(s => s.id === staffId ? { ...s, station_role: updated.station_role } : s));
    } catch (e: any) {
      alert(e.message ?? 'Failed to assign role');
    } finally {
      setSavingRole(null);
    }
  }

  const byStation = stations.reduce<Record<string, StaffAssignment[]>>((acc, s) => {
    acc[s] = staff.filter(p => p.station === s);
    return acc;
  }, {});
  const unassigned = staff.filter(p => !p.station);

  if (loading) return (
    <div className="p-6">
      <h1 className="text-xl font-black text-gray-900 mb-4">Morning Station Assignment</h1>
      <div className="grid grid-cols-2 gap-3">
        {[1,2,3,4,5,6].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-gray-200 animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-gray-900">Morning Station Assignment</h1>
          <p className="text-sm text-gray-500 mt-0.5">Assign staff to stations · Set station leads &amp; prep cooks</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddStation(s => !s)}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
          >＋ Add Station</button>
          <button onClick={load} className="text-xs text-brand-600 hover:text-brand-700 font-semibold">Refresh</button>
        </div>
      </div>

      {/* Add Station form */}
      {showAddStation && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-center gap-3">
          <input
            value={newStationName}
            onChange={e => setNewStationName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddStation()}
            placeholder="New station name (e.g. Cold Prep Station)"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            autoFocus
          />
          <button
            onClick={handleAddStation}
            disabled={addingStation || !newStationName.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >{addingStation ? 'Adding…' : 'Add'}</button>
          <button onClick={() => { setShowAddStation(false); setNewStationName(''); }} className="text-sm text-slate-500">Cancel</button>
        </div>
      )}

      {/* Current stations list */}
      <div className="mb-4 bg-white rounded-xl border border-gray-200 p-3">
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Active Stations ({stations.length})</p>
        <div className="flex flex-wrap gap-2">
          {stations.map(s => (
            <span key={s} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 text-xs font-semibold text-gray-700">
              {STATION_EMOJI[s] ?? '🍽'} {s}
            </span>
          ))}
        </div>
      </div>

      {/* Unassigned banner */}
      {unassigned.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
          <p className="text-xs font-black text-amber-600 uppercase tracking-widest mb-2">Unassigned Staff</p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(person => (
              <div key={person.id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-1.5">
                <div className="w-7 h-7 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-xs">
                  {(person.name ?? 'S')[0].toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-gray-700">{person.name ?? 'Staff'}</span>
                <select
                  value=""
                  onChange={e => { if (e.target.value) assignStation(person.id, e.target.value); }}
                  disabled={savingStation === person.id}
                  className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">Assign…</option>
                  {stations.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Station grid */}
      <div className="grid grid-cols-2 gap-3">
        {stations.map(station => {
          const people = byStation[station] ?? [];
          return (
            <div key={station}
              onDragOver={e => e.preventDefault()}
              onDrop={async () => { if (dragId) { await assignStation(dragId, station); setDragId(null); } }}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <span className="text-lg">{STATION_EMOJI[station] ?? '🍽'}</span>
                <p className="text-xs font-black text-gray-700 leading-tight">{station}</p>
                <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${people.length > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {people.length}
                </span>
              </div>

              <div className="p-3 space-y-2 min-h-[80px]">
                {people.map(person => (
                  <div key={person.id}
                    draggable
                    onDragStart={() => setDragId(person.id)}
                    className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 cursor-grab active:cursor-grabbing"
                  >
                    <div className="w-7 h-7 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 font-bold text-xs flex-shrink-0">
                      {(person.name ?? 'S')[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{person.name ?? 'Staff'}</span>
                    {person.station_role && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide ${ROLE_BADGE[person.station_role] ?? 'bg-gray-100 text-gray-500'}`}>
                        {person.station_role === 'lead' ? '★ Lead' : 'Prep'}
                      </span>
                    )}
                    <button
                      onClick={() => assignStation(person.id, null)}
                      disabled={savingStation === person.id}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Remove from station"
                    >
                      {savingStation === person.id ? '…' : '✕'}
                    </button>
                  </div>
                ))}
                {people.length === 0 && (
                  <p className="text-xs text-gray-300 text-center py-2">Drag staff here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick assign table */}
      <div className="mt-5 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <p className="text-xs font-black text-gray-500 uppercase tracking-widest">All Staff — Quick Assign</p>
          <p className="text-xs text-gray-400 ml-auto">Station · Role</p>
        </div>
        <div className="divide-y divide-gray-50">
          {staff.map(person => (
            <div key={person.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                {(person.name ?? 'S')[0].toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-gray-800 flex-1">{person.name ?? 'Staff'}</span>

              {/* Station select */}
              <select
                value={person.station ?? ''}
                onChange={e => assignStation(person.id, e.target.value || null)}
                disabled={savingStation === person.id}
                className="text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
              >
                <option value="">Unassigned</option>
                {stations.map(s => <option key={s} value={s}>{STATION_EMOJI[s] ?? '🍽'} {s}</option>)}
              </select>

              {/* Role select — only enabled when station is assigned */}
              <select
                value={person.station_role ?? ''}
                onChange={e => assignRole(person.id, e.target.value || null)}
                disabled={!person.station || savingRole === person.id}
                className="text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-40"
                title={!person.station ? 'Assign a station first' : undefined}
              >
                <option value="">No Role</option>
                <option value="lead">★ Station Lead</option>
                <option value="prep">Prep Cook</option>
              </select>

              {(savingStation === person.id || savingRole === person.id) && (
                <span className="text-xs text-gray-400">Saving…</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
