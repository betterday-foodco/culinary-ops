'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, KitchenBoardResponse, KitchenTask } from '../../../lib/api';

const PRIORITY_GROUPS = [
  { key: 'am',     label: '🌅 AM High',  priorities: [1],    color: 'bg-red-500',   light: 'bg-red-50',   text: 'text-red-700',   border: 'border-red-200' },
  { key: 'normal', label: '☀️ Normal',   priorities: [2, 3], color: 'bg-blue-500',  light: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-200' },
  { key: 'pm',     label: '🌙 PM/Later', priorities: [4, 5], color: 'bg-gray-400',  light: 'bg-gray-50',  text: 'text-gray-600',  border: 'border-gray-200' },
];

export default function DailyTasksPage() {
  const [board, setBoard] = useState<KitchenBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');

  const load = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const data = await api.getKitchenBoard(undefined);
      setBoard(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="w-10 h-10 bg-bd-yellow rounded-xl mx-auto mb-3 flex items-center justify-center animate-pulse">
          <span className="text-brand-700 font-black text-xs">BD</span>
        </div>
        <p className="text-sm text-gray-500">Loading daily tasks…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="text-center py-20">
      <p className="text-red-500 text-sm">{error}</p>
      <button onClick={load} className="mt-3 text-brand-600 text-sm underline">Retry</button>
    </div>
  );

  if (!board || !board.plan) return (
    <div className="text-center py-20">
      <p className="text-4xl mb-3">📅</p>
      <p className="text-gray-600 font-semibold">No active plan</p>
      <p className="text-gray-400 text-sm mt-1">Ask your admin to publish this week's plan.</p>
    </div>
  );

  const allTasks = board.tasks;
  const doneCt = allTasks.filter(t => t.log.status === 'done' || t.log.status === 'short').length;
  const inProgCt = allTasks.filter(t => t.log.status === 'in_progress').length;
  const pct = allTasks.length > 0 ? Math.round((doneCt / allTasks.length) * 100) : 0;

  const filteredTasks = allTasks.filter(t => {
    if (filter === 'todo') return t.log.status !== 'done' && t.log.status !== 'short';
    if (filter === 'done') return t.log.status === 'done' || t.log.status === 'short';
    return true;
  });

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-700 to-brand-500 rounded-2xl p-5 text-white">
        <h1 className="text-xl font-black">{board.plan.week_label}</h1>
        <p className="text-white/70 text-sm mt-0.5">Daily Cooking Report</p>
        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-white/70 mb-1">
              <span>{doneCt} done · {inProgCt} in progress</span>
              <span>{allTasks.length} total</span>
            </div>
            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#4ade80' : '#F5C842' }} />
            </div>
          </div>
          <span className={`text-3xl font-black leading-none ${pct === 100 ? 'text-green-300' : 'text-bd-yellow'}`}>{pct}%</span>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2">
        {(['all', 'todo', 'done'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 min-h-[40px] rounded-full text-xs font-bold transition-all capitalize ${filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}
          >
            {f === 'todo' ? 'To Do' : f === 'all' ? `All (${allTasks.length})` : `Done (${doneCt})`}
          </button>
        ))}
      </div>

      {/* Tasks grouped by priority band */}
      {PRIORITY_GROUPS.map(group => {
        const groupTasks = filteredTasks.filter(t => group.priorities.includes(t.priority ?? 3));
        if (groupTasks.length === 0) return null;
        const groupDone = groupTasks.filter(t => t.log.status === 'done' || t.log.status === 'short').length;
        return (
          <div key={group.key}>
            {/* Group header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${group.color}`} />
                <span className="text-sm font-bold text-gray-800">{group.label}</span>
              </div>
              <span className="text-xs text-gray-400 font-medium">{groupDone}/{groupTasks.length}</span>
            </div>
            {/* Task rows */}
            <div className="space-y-1.5">
              {groupTasks.map(task => <TaskRow key={task.sub_recipe_id} task={task} group={group} />)}
            </div>
          </div>
        );
      })}

      {filteredTasks.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-gray-600 font-semibold">All done!</p>
          <p className="text-gray-400 text-sm mt-1">No {filter === 'todo' ? 'remaining' : ''} tasks.</p>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, group }: { task: KitchenTask; group: typeof PRIORITY_GROUPS[0] }) {
  const isDone = task.log.status === 'done' || task.log.status === 'short';
  const isInProg = task.log.status === 'in_progress';
  const needed = task.total_quantity ?? 0;
  const cooked = task.log.qty_cooked ?? 0;
  const onHand = task.log.have_on_hand ?? 0;
  const total = cooked + onHand;
  const progressPct = needed > 0 ? Math.min(100, Math.round((total / needed) * 100)) : 0;

  return (
    <div className={`rounded-xl border px-3 py-3 min-h-[52px] ${isDone ? `${group.light} ${group.border}` : isInProg ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-2.5">
        {/* Status icon */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-black ${
          isDone ? 'bg-green-500 text-white' : isInProg ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'
        }`}>
          {isDone ? '✓' : isInProg ? '▶' : '○'}
        </div>

        {/* Name + station */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className={`text-sm font-semibold leading-tight ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {task.name}
            </p>
            {task.station_tag && (
              <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">{task.station_tag}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{needed.toFixed(2)} {task.unit}</span>
            {cooked > 0 && <span className="text-xs text-blue-600 font-medium">· {cooked.toFixed(2)} cooked</span>}
            {onHand > 0 && <span className="text-xs text-green-600 font-medium">· {onHand.toFixed(2)} on hand</span>}
          </div>
        </div>

        {/* Progress % */}
        {progressPct > 0 && !isDone && (
          <span className="text-xs font-bold text-gray-500 flex-shrink-0">{progressPct}%</span>
        )}
      </div>

      {/* Progress bar when in progress */}
      {isInProg && needed > 0 && (
        <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-1.5 bg-blue-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      )}
    </div>
  );
}
