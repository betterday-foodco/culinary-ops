'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, StationTask } from '../../../lib/api';

export default function DailyTasksPage() {
  const [tasks, setTasks] = useState<StationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const plan = await api.getCurrentProductionPlan();
      const data = await api.listStationTasks(plan?.id);
      setTasks(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(task: StationTask) {
    try {
      if (task.completed_at) await api.uncompleteStationTask(task.id);
      else await api.completeStationTask(task.id);
      await load();
    } catch (e: any) {
      alert(e.message ?? 'Failed to update task');
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="w-10 h-10 bg-bd-yellow rounded-xl mx-auto mb-3 flex items-center justify-center animate-pulse">
          <span className="text-brand-700 font-black text-xs">BD</span>
        </div>
        <p className="text-sm text-gray-500">Loading tasks…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="text-center py-20">
      <p className="text-red-500 text-sm">{error}</p>
      <button onClick={load} className="mt-3 text-brand-600 text-sm underline">Retry</button>
    </div>
  );

  // Group by station
  const grouped: Record<string, StationTask[]> = {};
  const all: StationTask[] = [];
  for (const t of tasks) {
    const key = t.station ?? 'All Stations';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
    all.push(t);
  }

  const doneCt = all.filter(t => !!t.completed_at).length;
  const pct = all.length > 0 ? Math.round((doneCt / all.length) * 100) : 0;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">Daily Tasks</h1>
        <p className="text-sm text-gray-500">{doneCt}/{all.length} completed · {pct}%</p>
        <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
          <div className="h-1.5 bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-gray-500 text-sm">No tasks assigned yet.</p>
          <p className="text-gray-400 text-xs mt-1">Ask your admin to add tasks for today.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([station, stationTasks]) => (
            <div key={station} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{station}</span>
                <span className="text-xs text-brand-600">{stationTasks.filter(t => !!t.completed_at).length}/{stationTasks.length}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {stationTasks.map(task => {
                  const done = !!task.completed_at;
                  return (
                    <button
                      key={task.id}
                      onClick={() => toggle(task)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-xs transition-colors ${done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                        {done && '✓'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-tight ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.title}</p>
                        {task.description && <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>}
                        <div className="flex flex-wrap gap-2 mt-1">
                          {task.assigned_user && <span className="text-xs text-gray-400">→ {task.assigned_user.name}</span>}
                          {task.completed_by && <span className="text-xs text-green-600 font-medium">✓ {task.completed_by.name}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
