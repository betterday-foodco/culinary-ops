'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, KitchenTask, KitchenBoardResponse, StationRequest, StationTask, PlanSubRecipeIngredient } from '../../lib/api';

type LogStatus = 'not_started' | 'in_progress' | 'done' | 'short';
type View = 'overview' | 'station';

interface TaskModal {
  task: KitchenTask;
  tab: 'record' | 'feedback' | 'request';
  qty: string;
  weight: string;
  haveOnHand: string;
  notes: string;
  cookedBy: string;
  rating: number;
  comment: string;
  toStation: string;
  reqDesc: string;
  reqQty: string;
  reqUnit: string;
}

const STATIONS = [
  'Veg Station',
  'Protein Station',
  'Sauce Station',
  'Oven Station',
  'Breakfast + Sides Station',
  'Packaging Station',
];

const STATION_CONFIG: Record<string, { emoji: string; gradient: string; accent: string; light: string; ring: string }> = {
  'Veg Station':               { emoji: '🥬', gradient: 'from-green-600 to-emerald-500',  accent: '#16a34a', light: '#f0fdf4', ring: '#86efac' },
  'Protein Station':           { emoji: '🥩', gradient: 'from-red-600 to-rose-500',        accent: '#dc2626', light: '#fff1f2', ring: '#fda4af' },
  'Sauce Station':             { emoji: '🫕', gradient: 'from-orange-600 to-amber-500',    accent: '#ea580c', light: '#fff7ed', ring: '#fdba74' },
  'Oven Station':              { emoji: '🔥', gradient: 'from-amber-600 to-yellow-500',    accent: '#d97706', light: '#fffbeb', ring: '#fcd34d' },
  'Breakfast + Sides Station': { emoji: '🍳', gradient: 'from-yellow-600 to-lime-500',     accent: '#ca8a04', light: '#fefce8', ring: '#fde047' },
  'Packaging Station':         { emoji: '📦', gradient: 'from-blue-600 to-indigo-500',     accent: '#2563eb', light: '#eff6ff', ring: '#93c5fd' },
};

function getStationConfig(station: string) {
  return STATION_CONFIG[station] ?? { emoji: '🍽️', gradient: 'from-gray-600 to-gray-500', accent: '#6b7280', light: '#f9fafb', ring: '#d1d5db' };
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// SVG Progress Ring
function ProgressRing({ pct, size = 52, stroke = 4, color }: { pct: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct === 100 ? '#4ade80' : 'rgba(255,255,255,0.9)'} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.5s ease' }} />
    </svg>
  );
}

export default function KitchenBoardPage() {
  const [view, setView] = useState<View>('overview');
  const [board, setBoard] = useState<KitchenBoardResponse | null>(null);
  const [stationBoard, setStationBoard] = useState<KitchenBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [stationLoading, setStationLoading] = useState(false);
  const [error, setError] = useState('');

  const [userStation, setUserStation] = useState('');
  const [userName, setUserName] = useState('');
  const [selectedStation, setSelectedStation] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<number | null>(null);

  const [taskModal, setTaskModal] = useState<TaskModal | null>(null);
  const [saving, setSaving] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [staffNames, setStaffNames] = useState<string[]>([]);

  useEffect(() => {
    const s = localStorage.getItem('user_station') ?? '';
    const n = localStorage.getItem('user_name') ?? '';
    setUserStation(s);
    setUserName(n);
    api.getKitchenStaffNames()
      .then(staff => setStaffNames(staff.map(s => s.name ?? '').filter(Boolean).sort()))
      .catch(() => {});
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      const data = await api.getKitchenBoard(undefined);
      setBoard(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStation = useCallback(async (station: string) => {
    try {
      setStationLoading(true);
      const data = await api.getKitchenBoard(station || undefined);
      setStationBoard(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load station');
    } finally {
      setStationLoading(false);
    }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  function openStation(station: string) {
    setSelectedStation(station);
    setPriorityFilter(null);
    setView('station');
    loadStation(station);
  }

  function backToOverview() {
    setView('overview');
    setSelectedStation('');
    loadOverview();
  }

  async function handleStatusChange(task: KitchenTask, status: LogStatus) {
    const activeBoard = view === 'station' ? stationBoard : board;
    if (!activeBoard?.plan) return;
    try {
      await api.upsertProductionLog({
        plan_id: activeBoard.plan.id,
        sub_recipe_id: task.sub_recipe_id,
        status,
        qty_cooked: task.log.qty_cooked ?? undefined,
        weight_recorded: task.log.weight_recorded ?? undefined,
        notes: task.log.notes ?? undefined,
      });
      const updater = (prev: KitchenBoardResponse | null) => {
        if (!prev) return prev;
        return { ...prev, tasks: prev.tasks.map((t) => t.sub_recipe_id === task.sub_recipe_id ? { ...t, log: { ...t.log, status } } : t) };
      };
      setStationBoard(updater);
      setBoard(updater);
      if (taskModal) setTaskModal({ ...taskModal, task: { ...taskModal.task, log: { ...taskModal.task.log, status } } });
    } catch (e: any) {
      alert(e.message ?? 'Failed to update status');
    }
  }

  async function saveLog() {
    if (!taskModal) return;
    const activeBoard = view === 'station' ? stationBoard : board;
    if (!activeBoard?.plan) return;
    setSaving(true);
    try {
      const qtyCooked = taskModal.qty ? parseFloat(taskModal.qty) : undefined;
      const haveOnHand = taskModal.haveOnHand ? parseFloat(taskModal.haveOnHand) : undefined;
      const totalAvailable = (qtyCooked ?? 0) + (haveOnHand ?? 0);
      const totalNeeded = taskModal.task.total_quantity ?? 0;
      const effectiveStatus: LogStatus =
        taskModal.task.log.status === 'done' && qtyCooked != null && totalAvailable < totalNeeded * 0.99
          ? 'short'
          : taskModal.task.log.status;
      await api.upsertProductionLog({
        plan_id: activeBoard.plan.id,
        sub_recipe_id: taskModal.task.sub_recipe_id,
        status: effectiveStatus,
        qty_cooked: qtyCooked,
        weight_recorded: taskModal.weight ? parseFloat(taskModal.weight) : undefined,
        have_on_hand: haveOnHand,
        notes: taskModal.notes || undefined,
        cooked_by: taskModal.cookedBy || undefined,
      });
      const updater = (prev: KitchenBoardResponse | null) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.sub_recipe_id === taskModal.task.sub_recipe_id
              ? { ...t, log: { ...t.log, qty_cooked: taskModal.qty ? parseFloat(taskModal.qty) : null, weight_recorded: taskModal.weight ? parseFloat(taskModal.weight) : null, notes: taskModal.notes || null } }
              : t
          ),
        };
      };
      setStationBoard(updater);
      setBoard(updater);
      setTaskModal(null);
    } catch (e: any) {
      alert(e.message ?? 'Failed to save log');
    } finally {
      setSaving(false);
    }
  }

  async function saveFeedback() {
    if (!taskModal) return;
    const activeBoard = view === 'station' ? stationBoard : board;
    if (!activeBoard?.plan) return;
    setSaving(true);
    try {
      await api.submitKitchenFeedback({ sub_recipe_id: taskModal.task.sub_recipe_id, plan_id: activeBoard.plan.id, rating: taskModal.rating, comment: taskModal.comment || undefined });
      setTaskModal(null);
    } catch (e: any) {
      alert(e.message ?? 'Failed to submit feedback');
    } finally {
      setSaving(false);
    }
  }

  async function saveRequest() {
    if (!taskModal) return;
    const activeBoard = view === 'station' ? stationBoard : board;
    if (!activeBoard?.plan) return;
    if (!taskModal.toStation) { alert('Please select a station'); return; }
    if (!taskModal.reqDesc.trim()) { alert('Please enter a description'); return; }
    setSaving(true);
    try {
      await api.createStationRequest({ to_station: taskModal.toStation, description: taskModal.reqDesc, quantity: taskModal.reqQty ? parseFloat(taskModal.reqQty) : undefined, unit: taskModal.reqUnit || undefined, sub_recipe_id: taskModal.task.sub_recipe_id, plan_id: activeBoard.plan.id });
      setTaskModal(null);
    } catch (e: any) {
      alert(e.message ?? 'Failed to send request');
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestStatus(requestId: string, status: 'acknowledged' | 'completed') {
    try {
      await api.updateStationRequestStatus(requestId, status);
      const updater = (prev: KitchenBoardResponse | null) => {
        if (!prev) return prev;
        return { ...prev, pendingRequests: prev.pendingRequests.map((r) => r.id === requestId ? { ...r, status } : r).filter((r) => r.status !== 'completed') };
      };
      setBoard(updater);
      setStationBoard(updater);
    } catch (e: any) {
      alert(e.message ?? 'Failed to update request');
    }
  }

  function openTaskModal(task: KitchenTask) {
    setShowIngredients((task.ingredients?.length ?? 0) > 0);
    setShowInstructions(false);
    const defaultName = task.completed_by || localStorage.getItem('user_name') || '';
    setTaskModal({ task, tab: 'record', qty: task.log.qty_cooked?.toString() ?? '', weight: task.log.weight_recorded?.toString() ?? '', haveOnHand: task.log.have_on_hand?.toString() ?? '', notes: task.log.notes ?? '', cookedBy: defaultName, rating: 5, comment: '', toStation: '', reqDesc: '', reqQty: '', reqUnit: 'Kgs' });
  }

  function getStationStats(station: string) {
    const tasks = board?.tasks.filter((t) => t.station_tag === station) ?? [];
    const done = tasks.filter((t) => t.log.status === 'done').length;
    const inProg = tasks.filter((t) => t.log.status === 'in_progress').length;
    const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
    return { total: tasks.length, done, inProg, pct };
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-brand-600 to-brand-400 rounded-2xl mx-auto mb-4 flex items-center justify-center animate-pulse shadow-lg">
            <span className="text-white font-black text-lg tracking-tight">BD</span>
          </div>
          <p className="text-gray-500 text-sm font-medium">Loading your kitchen…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 px-4">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="text-red-500 text-sm font-medium mb-3">{error}</p>
        <button onClick={loadOverview} className="px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors">Retry</button>
      </div>
    );
  }

  if (!board?.plan) {
    return (
      <div className="text-center py-20 px-4">
        <p className="text-5xl mb-4">{board?.notPublished ? '🔒' : '📅'}</p>
        <h2 className="text-lg font-bold text-gray-700">{board?.notPublished ? 'Plan not published yet' : 'No active production plan'}</h2>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">
          {board?.notPublished ? 'Your admin has created this week\'s plan but hasn\'t published it to the kitchen yet.' : 'Ask your admin to create and publish a plan for this week.'}
        </p>
      </div>
    );
  }

  const activeBoard = view === 'station' ? stationBoard : board;
  const stationTasks = activeBoard?.tasks ?? [];
  const doneTasks = stationTasks.filter((t) => t.log.status === 'done').length;
  const inProgTasks = stationTasks.filter((t) => t.log.status === 'in_progress').length;
  const stationPct = stationTasks.length > 0 ? Math.round((doneTasks / stationTasks.length) * 100) : 0;

  const sortedTasks = [...stationTasks].sort((a, b) => {
    // Done/short go to bottom; within each group sort by priority asc (1 = highest)
    const aBottom = a.log.status === 'done' || a.log.status === 'short' ? 1 : 0;
    const bBottom = b.log.status === 'done' || b.log.status === 'short' ? 1 : 0;
    if (aBottom !== bBottom) return aBottom - bBottom;
    return (a.priority ?? 5) - (b.priority ?? 5);
  });
  const filteredTasks = priorityFilter != null ? sortedTasks.filter((t) => t.priority === priorityFilter) : sortedTasks;
  const priorities = [...new Set(stationTasks.map((t) => t.priority))].sort();
  const pendingRequests = (view === 'station' ? stationBoard?.pendingRequests : board?.pendingRequests) ?? [];

  // ── Overview ──────────────────────────────────────────────────────────────
  if (view === 'overview') {
    const allTasks = board.tasks;
    const allDone = allTasks.filter(t => t.log.status === 'done').length;
    const allTotal = allTasks.length;
    const overallPct = allTotal > 0 ? Math.round((allDone / allTotal) * 100) : 0;

    return (
      <div className="space-y-5">
        {/* Greeting hero */}
        <div className="bg-gradient-to-br from-brand-700 to-brand-500 rounded-2xl p-5 text-white shadow-lg">
          <p className="text-white/70 text-sm font-medium">{getGreeting()}, {userName || 'Chef'} 👋</p>
          <h1 className="text-2xl font-black mt-0.5 mb-1">{board.plan.week_label}</h1>
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/70 text-xs font-medium">Overall Progress</span>
                <span className="text-white font-bold text-sm">{allDone}/{allTotal}</span>
              </div>
              <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-2.5 rounded-full transition-all duration-500" style={{ width: `${overallPct}%`, backgroundColor: overallPct === 100 ? '#4ade80' : '#F5C842' }} />
              </div>
            </div>
            <div className="text-right">
              <span className={`text-3xl font-black leading-none ${overallPct === 100 ? 'text-green-300' : 'text-bd-yellow'}`}>{overallPct}%</span>
            </div>
          </div>
        </div>

        {/* Incoming requests */}
        {pendingRequests.length > 0 && (
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <PendingRequestBanner key={req.id} req={req} onAck={() => handleRequestStatus(req.id, 'acknowledged')} onDone={() => handleRequestStatus(req.id, 'completed')} />
            ))}
          </div>
        )}

        {/* Station Tasks */}
        {(board.stationTasks ?? []).length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 bg-amber-400 rounded-md flex items-center justify-center text-[10px]">📌</span>
              Station Tasks
            </h2>
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 shadow-sm overflow-hidden">
              {(board.stationTasks ?? []).map((t: StationTask) => (
                <StationTaskRow key={t.id} task={t} onToggle={async () => {
                  try {
                    if (t.completed_at) await api.uncompleteStationTask(t.id);
                    else await api.completeStationTask(t.id);
                    const data = await api.getKitchenBoard(undefined);
                    setBoard(data);
                  } catch {}
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Station cards */}
        <div>
          <h2 className="text-sm font-bold text-gray-700 mb-3">Your Stations</h2>
          <div className="grid grid-cols-2 gap-3">
            {STATIONS.map((station) => {
              const stats = getStationStats(station);
              const isYours = station === userStation;
              const cfg = getStationConfig(station);
              const allDoneStation = stats.total > 0 && stats.pct === 100;

              return (
                <button
                  key={station}
                  onClick={() => openStation(station)}
                  className={`relative rounded-2xl overflow-hidden text-left active:scale-[0.96] transition-transform shadow-sm ${isYours ? 'ring-2 ring-offset-2 ring-brand-400' : ''}`}
                >
                  {/* Card background */}
                  <div className={`bg-gradient-to-br ${cfg.gradient} p-4`}>
                    {/* Top row */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-2xl leading-none">{cfg.emoji}</span>
                        {isYours && (
                          <span className="ml-1.5 text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">YOU</span>
                        )}
                      </div>
                      {/* Mini ring */}
                      <div className="relative">
                        <ProgressRing pct={stats.pct} size={44} stroke={4} color={cfg.accent} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-white text-[10px] font-black">{stats.pct}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Station name */}
                    <p className="text-white font-bold text-xs leading-tight mb-2">{station}</p>

                    {/* Stats row */}
                    {stats.total > 0 ? (
                      <>
                        <div className="flex items-center justify-between text-[10px] text-white/70 mb-1.5">
                          <span>{stats.done} done · {stats.inProg} active</span>
                          <span>{stats.total} total</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                          <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${stats.pct}%`, backgroundColor: allDoneStation ? '#4ade80' : 'rgba(255,255,255,0.9)' }} />
                        </div>
                      </>
                    ) : (
                      <p className="text-white/50 text-[10px]">No tasks assigned</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Station Task List ─────────────────────────────────────────────────────
  const cfg = getStationConfig(selectedStation);

  return (
    <div>
      {/* Station header */}
      <div className={`bg-gradient-to-br ${cfg.gradient} -mx-4 -mt-6 px-4 pt-5 pb-5 mb-4 rounded-b-3xl shadow-md`}>
        <button onClick={backToOverview} className="flex items-center gap-1.5 text-white/70 text-sm mb-3 hover:text-white transition-colors font-medium">
          <span>←</span> All Stations
        </button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-3xl">{cfg.emoji}</span>
              <h1 className="text-xl font-black text-white leading-tight">{selectedStation}</h1>
            </div>
            <div className="flex items-center gap-3 text-white/70 text-xs font-medium">
              <span>{doneTasks} done</span>
              <span>·</span>
              <span>{inProgTasks} in progress</span>
              <span>·</span>
              <span>{stationTasks.length} total</span>
            </div>
          </div>
          <div className="relative flex-shrink-0">
            <ProgressRing pct={stationPct} size={64} stroke={5} color={cfg.accent} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white text-sm font-black">{stationPct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Incoming requests */}
      {pendingRequests.length > 0 && (
        <div className="mb-4 space-y-2">
          {pendingRequests.map((req) => (
            <PendingRequestBanner key={req.id} req={req} onAck={() => handleRequestStatus(req.id, 'acknowledged')} onDone={() => handleRequestStatus(req.id, 'completed')} />
          ))}
        </div>
      )}

      {/* Priority filter */}
      {priorities.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setPriorityFilter(null)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all ${priorityFilter === null ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            All
          </button>
          {priorities.map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all ${priorityFilter === p ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              P{p}
            </button>
          ))}
        </div>
      )}

      {/* Task list */}
      {stationLoading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-2 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">✅</div>
          <p className="text-gray-700 font-semibold">All done!</p>
          <p className="text-gray-400 text-sm mt-1">No tasks for this station.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => {
            const isDone = task.log.status === 'done';
            const isInProgress = task.log.status === 'in_progress';
            const ingCount = task.ingredients?.length ?? 0;

            return (
              <button
                key={task.sub_recipe_id}
                onClick={() => openTaskModal(task)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left active:scale-[0.98] transition-all shadow-sm
                  ${isDone ? 'bg-green-50 border-green-200' : isInProgress ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'}`}
              >
                {/* Status badge */}
                <div className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center font-black text-sm
                  ${isDone ? 'bg-green-500 text-white' : isInProgress ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {isDone ? '✓' : isInProgress ? '▶' : task.priority ?? '·'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-tight ${isDone ? 'line-through text-gray-400' : isInProgress ? 'text-blue-900' : 'text-gray-900'}`}>
                    {task.display_name || task.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
                    <span className="text-xs text-gray-500">
                      {(task.total_quantity ?? 0).toFixed(2)} {task.unit}
                    </span>
                    {task.log.qty_cooked != null && (
                      <span className="text-xs text-green-600 font-medium">· Made: {task.log.qty_cooked}</span>
                    )}
                    {isDone && task.completed_by && (
                      <span className="text-xs text-green-600 font-semibold">· {task.completed_by}</span>
                    )}
                    {ingCount > 0 && !isDone && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">{ingCount} ings</span>
                    )}
                  </div>
                </div>

                {/* Status pill */}
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  {task.priority === 1 && !isDone && (
                    <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-black uppercase tracking-wide">HIGH</span>
                  )}
                  {task.log.status === 'short' || (isDone && task.log.qty_cooked != null && (task.log.qty_cooked + (task.log.have_on_hand ?? 0)) < (task.total_quantity ?? 0) * 0.99) ? (
                    <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${task.log.shortage_approved ? 'bg-amber-400 text-white' : 'bg-red-500 text-white'}`}>
                      {task.log.shortage_approved ? 'Short ✓' : 'Short'}
                    </span>
                  ) : isDone ? (
                    <span className="text-[10px] bg-green-500 text-white px-2 py-1 rounded-full font-bold">Done</span>
                  ) : isInProgress ? (
                    <span className="text-[10px] bg-blue-500 text-white px-2 py-1 rounded-full font-bold">Active</span>
                  ) : (
                    <span className="text-gray-300 text-lg">›</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Task detail modal */}
      {taskModal && (
        <TaskDetailModal
          task={taskModal.task}
          modal={taskModal}
          saving={saving}
          showIngredients={showIngredients}
          showInstructions={showInstructions}
          stations={STATIONS.filter((s) => s !== selectedStation)}
          staffNames={staffNames}
          stationCfg={cfg}
          onClose={() => setTaskModal(null)}
          onStatusChange={(s) => handleStatusChange(taskModal.task, s)}
          onTabChange={(tab) => setTaskModal({ ...taskModal, tab })}
          onQtyChange={(v) => setTaskModal({ ...taskModal, qty: v })}
          onHaveOnHandChange={(v) => setTaskModal({ ...taskModal, haveOnHand: v })}
          onNotesChange={(v) => setTaskModal({ ...taskModal, notes: v })}
          onCookedByChange={(v) => setTaskModal({ ...taskModal, cookedBy: v })}
          onSaveLog={saveLog}
          onRatingChange={(v) => setTaskModal({ ...taskModal, rating: v })}
          onCommentChange={(v) => setTaskModal({ ...taskModal, comment: v })}
          onSaveFeedback={saveFeedback}
          onToStationChange={(v) => setTaskModal({ ...taskModal, toStation: v })}
          onReqDescChange={(v) => setTaskModal({ ...taskModal, reqDesc: v })}
          onReqQtyChange={(v) => setTaskModal({ ...taskModal, reqQty: v })}
          onReqUnitChange={(v) => setTaskModal({ ...taskModal, reqUnit: v })}
          onSaveRequest={saveRequest}
          onToggleIngredients={() => setShowIngredients((p) => !p)}
          onToggleInstructions={() => setShowInstructions((p) => !p)}
        />
      )}
    </div>
  );
}

// ── Station Task Row ──────────────────────────────────────────────────────────
function StationTaskRow({ task, onToggle }: { task: StationTask; onToggle: () => void }) {
  const done = !!task.completed_at;
  return (
    <button onClick={onToggle} className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
      <div className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-xs transition-all ${done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-brand-400'}`}>
        {done && '✓'}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.title}</p>
        {task.description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{task.description}</p>}
        <div className="flex flex-wrap gap-2 mt-1">
          {task.station && <span className="text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">{task.station}</span>}
          {task.assigned_user && <span className="text-[10px] text-gray-500">→ {task.assigned_user.name}</span>}
          {task.completed_by && <span className="text-[10px] text-green-600 font-semibold">✓ {task.completed_by.name}</span>}
        </div>
      </div>
    </button>
  );
}

// ── Pending Request Banner ────────────────────────────────────────────────────
function PendingRequestBanner({ req, onAck, onDone }: { req: StationRequest; onAck: () => void; onDone: () => void }) {
  const isPending = req.status === 'pending';
  return (
    <div className={`rounded-2xl border p-3.5 ${isPending ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800">
            {isPending ? '🔴' : '🟡'} Request from {req.from_user?.station ?? 'Unknown Station'}
          </p>
          <p className="text-sm text-gray-700 mt-0.5">{req.description}</p>
          {req.quantity && <p className="text-xs text-gray-500 mt-0.5">Qty: {req.quantity} {req.unit}</p>}
          {req.sub_recipe && <p className="text-xs text-gray-500">Re: {req.sub_recipe.display_name || req.sub_recipe.name}</p>}
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {isPending && <button onClick={onAck} className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-xl hover:bg-amber-600 font-semibold">Ack</button>}
          <button onClick={onDone} className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-xl hover:bg-green-600 font-semibold">Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Task Detail Modal ─────────────────────────────────────────────────────────
function TaskDetailModal({
  task, modal, saving, showIngredients, showInstructions, stations, staffNames, stationCfg,
  onClose, onStatusChange, onTabChange, onQtyChange, onHaveOnHandChange, onNotesChange, onCookedByChange, onSaveLog,
  onRatingChange, onCommentChange, onSaveFeedback,
  onToStationChange, onReqDescChange, onReqQtyChange, onReqUnitChange, onSaveRequest,
  onToggleIngredients, onToggleInstructions,
}: {
  task: KitchenTask; modal: TaskModal; saving: boolean;
  showIngredients: boolean; showInstructions: boolean; stations: string[]; staffNames: string[];
  stationCfg: { emoji: string; gradient: string; accent: string; light: string; ring: string };
  onClose: () => void; onStatusChange: (s: LogStatus) => void;
  onTabChange: (t: 'record' | 'feedback' | 'request') => void;
  onQtyChange: (v: string) => void; onHaveOnHandChange: (v: string) => void; onNotesChange: (v: string) => void; onCookedByChange: (v: string) => void; onSaveLog: () => void;
  onRatingChange: (v: number) => void; onCommentChange: (v: string) => void; onSaveFeedback: () => void;
  onToStationChange: (v: string) => void; onReqDescChange: (v: string) => void; onReqQtyChange: (v: string) => void; onReqUnitChange: (v: string) => void; onSaveRequest: () => void;
  onToggleIngredients: () => void; onToggleInstructions: () => void;
}) {
  const [checkedIngs, setCheckedIngs] = useState<Set<number>>(new Set());
  const [batchMultiplier, setBatchMultiplier] = useState('');
  const [selectedReqIngId, setSelectedReqIngId] = useState<string | null>(null);

  // Helper: station abbreviation + day label e.g. "Sauce W", "Veg Th"
  function getSourceLabel(ing: PlanSubRecipeIngredient): string | null {
    if (ing.type !== 'sub_recipe' || !ing.station_tag) return null;
    const stationWords = ing.station_tag.replace(' + Sides Station', '').replace(' Station', '').trim().split(' ');
    const stAbbr = stationWords[0]; // "Veg", "Protein", "Sauce", "Oven", "Breakfast", "Packaging"
    const day = ing.production_day ?? '';
    const dayAbbr = day.toLowerCase().startsWith('wed') ? 'W'
      : day.toLowerCase().startsWith('thu') ? 'Th'
      : day.toLowerCase().startsWith('fri') ? 'Fr'
      : ing.priority === 1 ? 'W' : ing.priority === 2 ? 'Th' : ing.priority === 3 ? 'Fr' : '';
    return dayAbbr ? `${stAbbr} ${dayAbbr}` : stAbbr || null;
  }

  const ingCount = task.ingredients?.length ?? 0;
  const allIngsChecked = ingCount === 0 || checkedIngs.size >= ingCount;

  function toggleIng(idx: number) {
    setCheckedIngs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  const original = task.total_quantity ?? 0;
  const onHand = parseFloat(modal.haveOnHand) || 0;
  const needToCook = Math.max(0, original - onHand);
  const batchMult = parseFloat(batchMultiplier) || 1;
  const totalToMake = parseFloat((needToCook * batchMult).toFixed(3));
  const effectiveMultiplier = original > 0 ? parseFloat((totalToMake / original).toFixed(2)) : 1;

  const isDone = task.log.status === 'done' || task.log.status === 'short';
  const isShort = task.log.status === 'short';
  const isInProgress = task.log.status === 'in_progress';
  const name = task.display_name || task.name;

  const TAB_ICONS = { record: '📋', feedback: '⭐', request: '🔔' };
  const TAB_LABELS = { record: 'Record', feedback: 'Feedback', request: 'Request' };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-50 w-full max-w-lg rounded-t-3xl max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className={`bg-gradient-to-br ${stationCfg.gradient} px-5 pt-3 pb-5 mx-3 rounded-2xl mb-1`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${isDone ? 'bg-green-400/30 text-green-100' : isInProgress ? 'bg-white/20 text-white/80' : 'bg-white/20 text-white/70'}`}>
                  {isDone ? '✓ Complete' : isInProgress ? '▶ In Progress' : `Priority ${task.priority}`}
                </span>
              </div>
              <h2 className="text-lg font-black text-white leading-tight">{name}</h2>
              <p className="text-white/70 text-sm mt-0.5 font-medium">{(task.total_quantity ?? 0).toFixed(2)} {task.unit}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white text-sm transition-colors flex-shrink-0">
              ✕
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex px-3 pt-3 gap-2">
          {(['record', 'feedback', 'request'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${modal.tab === t ? 'bg-white shadow-sm text-gray-900 border border-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <span>{TAB_ICONS[t]}</span>
              <span>{TAB_LABELS[t]}</span>
            </button>
          ))}
        </div>

        <div className="p-3 space-y-3 pb-8">

          {/* ── Record Tab ── */}
          {modal.tab === 'record' && (
            <>
              {/* Recipe Multiplier */}
              <div className="bg-violet-600 rounded-2xl p-4 text-white">
                <p className="text-xs font-black uppercase tracking-widest text-violet-200 mb-3">Recipe Multiplier</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-white/15 rounded-xl p-3">
                    <p className="text-[10px] text-violet-200 mb-0.5">Original Needed</p>
                    <p className="text-2xl font-black">{original.toFixed(2)}</p>
                    <p className="text-[10px] text-violet-300">{task.unit}</p>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 relative">
                    <p className="text-[10px] text-violet-200 mb-0.5">Have on Hand</p>
                    <input
                      type="number" min="0" step="0.01"
                      value={modal.haveOnHand}
                      onChange={(e) => onHaveOnHandChange(e.target.value)}
                      placeholder="0"
                      className="w-full text-2xl font-black text-white bg-transparent focus:outline-none placeholder:text-violet-400"
                    />
                    <p className="text-[10px] text-violet-300">{task.unit}</p>
                  </div>
                </div>
                <div className="mb-3">
                  <p className="text-[10px] text-violet-200 mb-1.5">Want to cook extra? (Batch Multiplier)</p>
                  <input
                    type="number" min="1" step="0.5"
                    value={batchMultiplier}
                    onChange={(e) => setBatchMultiplier(e.target.value)}
                    placeholder="1"
                    className="w-full px-3 py-2 bg-white/15 rounded-xl text-sm text-white placeholder:text-violet-400 focus:outline-none focus:bg-white/25 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/10 rounded-xl p-2 text-center">
                    <p className="text-[9px] text-violet-300 mb-0.5">New Target</p>
                    <p className="text-sm font-black">{totalToMake.toFixed(2)}</p>
                    <p className="text-[9px] text-violet-300">{task.unit}</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 text-center">
                    <p className="text-[9px] text-violet-600 mb-0.5">Need to Cook</p>
                    <p className="text-sm font-black text-violet-700">{(needToCook * batchMult).toFixed(2)}</p>
                    <p className="text-[9px] text-violet-500">{task.unit}</p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-2 text-center">
                    <p className="text-[9px] text-violet-300 mb-0.5">Multiplier</p>
                    <p className="text-sm font-black">×{effectiveMultiplier.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Qty Cooked */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                {task.completed_by && (
                  <div className="mb-3 px-3 py-2 bg-green-50 rounded-xl text-xs text-green-700 font-bold border border-green-200">
                    ✓ Completed by {task.completed_by}
                  </div>
                )}
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">How much did you cook?</p>
                <div className="flex items-end justify-center gap-2 pb-2 border-b-2 border-gray-100 mb-4">
                  <input
                    type="number" min="0" step="0.01"
                    value={modal.qty}
                    onChange={(e) => onQtyChange(e.target.value)}
                    placeholder={(needToCook * batchMult).toFixed(2)}
                    className="text-5xl font-black text-center bg-transparent focus:outline-none text-gray-900 w-40 placeholder:text-gray-200"
                  />
                  <span className="text-lg font-bold text-gray-400 pb-1">{task.unit}</span>
                </div>

                {/* Shortage approval notice */}
                {task.log.status === 'short' && (
                  <div className={`mb-2 px-3 py-2.5 rounded-xl text-xs font-bold border flex items-center gap-2 ${task.log.shortage_approved ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    {task.log.shortage_approved ? (
                      <><span>✓</span><span>Shortage approved by {task.log.shortage_approved_by?.name ?? 'Admin'}</span></>
                    ) : (
                      <><span>⚠️</span><span>Short — waiting for admin approval</span></>
                    )}
                  </div>
                )}

                {/* Status buttons */}
                <div className="flex gap-1.5 flex-wrap">
                  {(['not_started', 'in_progress', 'done', 'short'] as const).map((s) => {
                    const blockDone = s === 'done' && !allIngsChecked && !isDone;
                    const isActive = task.log.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => !blockDone && onStatusChange(s)}
                        disabled={blockDone}
                        className={`flex-1 min-w-[70px] py-2.5 rounded-xl text-xs font-bold transition-all border ${
                          blockDone ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed'
                          : isActive
                            ? s === 'done' ? 'bg-green-500 text-white border-green-500 shadow-sm'
                              : s === 'in_progress' ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                              : s === 'short' ? 'bg-red-500 text-white border-red-500 shadow-sm'
                              : 'bg-gray-200 text-gray-700 border-gray-300'
                            : s === 'short' ? 'border-red-200 text-red-500 hover:bg-red-50'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300'
                        }`}>
                        {s === 'not_started' ? '○ Not Started' : s === 'in_progress' ? '▶ Active' : s === 'done' ? '✓ Done' : '⚠ Short'}
                      </button>
                    );
                  })}
                </div>

                {ingCount > 0 && !allIngsChecked && !isDone && (
                  <div className="mt-2 flex items-center gap-1.5 px-3 py-2 bg-amber-50 rounded-xl border border-amber-200">
                    <span className="text-amber-500">✋</span>
                    <p className="text-xs text-amber-700 font-semibold">Check all ingredients ({checkedIngs.size}/{ingCount}) to mark Done</p>
                  </div>
                )}

                {/* Cooked by chips */}
                {(modal.qty || modal.cookedBy) && staffNames.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Cooked by</p>
                    <div className="flex flex-wrap gap-2">
                      {staffNames.map((n) => (
                        <button
                          key={n}
                          onClick={() => onCookedByChange(modal.cookedBy === n ? '' : n)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95 ${
                            modal.cookedBy === n
                              ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                              : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Scribble Pad */}
              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Scribble Pad</p>
                <textarea
                  rows={3}
                  value={modal.notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder="Write a note, reminder, or anything…"
                  className="w-full bg-transparent text-sm text-gray-700 focus:outline-none resize-none placeholder:text-amber-300"
                />
              </div>

              {/* Save button */}
              <button
                onClick={onSaveLog}
                disabled={saving}
                className="w-full py-4 bg-gray-900 text-white rounded-2xl text-sm font-black hover:bg-gray-800 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm"
              >
                {saving ? 'Saving…' : 'Save Record'}
              </button>

              {/* Instructions */}
              {task.instructions && (
                <div className="bg-sky-50 rounded-2xl overflow-hidden border border-sky-200">
                  <button onClick={onToggleInstructions} className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-bold text-sky-800 hover:bg-sky-100 transition-colors">
                    <span className="flex items-center gap-2"><span>📖</span> Instructions</span>
                    <span className="text-sky-400 text-lg">{showInstructions ? '▲' : '▾'}</span>
                  </button>
                  {showInstructions && (
                    <div className="px-4 pb-4 pt-1">
                      <p className="text-sm text-sky-900 whitespace-pre-wrap leading-relaxed">{task.instructions}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Ingredients checklist */}
              {ingCount > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                  <button onClick={onToggleIngredients} className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                    <span className="flex items-center gap-2">
                      <span>🧂</span>
                      <span>Ingredients</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${checkedIngs.size >= ingCount ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {checkedIngs.size}/{ingCount}
                      </span>
                    </span>
                    <span className="text-gray-400 text-lg">{showIngredients ? '▲' : '▾'}</span>
                  </button>
                  {showIngredients && (
                    <div className="divide-y divide-gray-100">
                      {task.ingredients.map((ing: PlanSubRecipeIngredient, i: number) => {
                        const checked = checkedIngs.has(i);
                        const scaledQty = (ing.quantity * effectiveMultiplier).toFixed(2);
                        const sourceLabel = getSourceLabel(ing);
                        return (
                          <button
                            key={i}
                            onClick={() => toggleIng(i)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors active:scale-[0.99] ${checked ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                          >
                            <div className={`w-6 h-6 flex-shrink-0 rounded-lg border-2 flex items-center justify-center text-xs font-bold transition-all ${checked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>
                              {checked ? '✓' : ''}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm font-medium block ${checked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                {ing.display_name || ing.name}
                              </span>
                              {sourceLabel && !checked && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold mt-0.5 inline-block">
                                  {sourceLabel}
                                </span>
                              )}
                            </div>
                            <span className={`text-xs font-bold flex-shrink-0 ${checked ? 'text-gray-400' : 'text-gray-700'}`}>
                              {scaledQty} {ing.unit}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Feedback Tab ── */}
          {modal.tab === 'feedback' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Recipe Feedback</p>
              <div className="mb-5">
                <label className="text-xs font-bold text-gray-600 block mb-3">How was it?</label>
                <div className="flex gap-3 justify-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => onRatingChange(star)} className="text-4xl leading-none transition-all hover:scale-125 active:scale-110">
                      {star <= modal.rating ? '⭐' : '☆'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600">Comments</label>
                <textarea
                  rows={4}
                  value={modal.comment}
                  onChange={(e) => onCommentChange(e.target.value)}
                  placeholder="What went well? Any issues? Notes for next time…"
                  className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50 resize-none"
                />
              </div>
              <button
                onClick={onSaveFeedback}
                disabled={saving}
                className="w-full mt-4 py-3.5 bg-gray-900 text-white rounded-2xl text-sm font-black hover:bg-gray-800 disabled:opacity-50 transition-all"
              >
                {saving ? 'Submitting…' : 'Submit Feedback'}
              </button>
            </div>
          )}

          {/* ── Request Tab ── */}
          {modal.tab === 'request' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Request from Station</p>
              <div className="space-y-3">

                {/* Quick-pick from this recipe's ingredients */}
                {task.ingredients.length > 0 && (
                  <div>
                    <label className="text-xs font-bold text-gray-600">Pick an ingredient from this recipe</label>
                    <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                      {task.ingredients.map((ing: PlanSubRecipeIngredient, i: number) => {
                        const scaledQty = (ing.quantity * effectiveMultiplier).toFixed(2);
                        const sourceLabel = getSourceLabel(ing);
                        const ingKey = `${ing.id}-${i}`;
                        const isSelected = selectedReqIngId === ingKey;
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setSelectedReqIngId(isSelected ? null : ingKey);
                              if (!isSelected) {
                                onReqDescChange(ing.display_name || ing.name);
                                onReqQtyChange(scaledQty);
                                onReqUnitChange(ing.unit || 'Kgs');
                                if (ing.station_tag) onToStationChange(ing.station_tag);
                              } else {
                                onReqDescChange('');
                                onReqQtyChange('');
                              }
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                          >
                            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isSelected ? 'bg-brand-600 border-brand-600' : 'border-gray-300'}`} />
                            <span className="flex-1 text-sm font-medium text-gray-800 truncate">{ing.display_name || ing.name}</span>
                            {sourceLabel && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">{sourceLabel}</span>
                            )}
                            <span className="text-xs text-gray-500 flex-shrink-0">{scaledQty} {ing.unit}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-gray-600">Send to Station</label>
                  <select
                    value={modal.toStation}
                    onChange={(e) => onToStationChange(e.target.value)}
                    className="mt-1.5 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"
                  >
                    <option value="">Select station…</option>
                    {stations.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600">What do you need?</label>
                  <textarea
                    rows={2}
                    value={modal.reqDesc}
                    onChange={(e) => onReqDescChange(e.target.value)}
                    placeholder="Describe what you need… (auto-filled when you pick above)"
                    className="mt-1.5 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-600">Quantity</label>
                    <input
                      type="number" min="0" step="0.1"
                      value={modal.reqQty}
                      onChange={(e) => onReqQtyChange(e.target.value)}
                      placeholder="e.g. 2"
                      className="mt-1.5 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs font-bold text-gray-600">Unit</label>
                    <select
                      value={modal.reqUnit}
                      onChange={(e) => onReqUnitChange(e.target.value)}
                      className="mt-1.5 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"
                    >
                      {['Kgs', 'g', 'L', 'ml', 'pcs', 'cups', 'un'].map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <button
                onClick={onSaveRequest}
                disabled={saving}
                className="w-full mt-4 py-3.5 bg-gray-900 text-white rounded-2xl text-sm font-black hover:bg-gray-800 disabled:opacity-50 transition-all"
              >
                {saving ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
