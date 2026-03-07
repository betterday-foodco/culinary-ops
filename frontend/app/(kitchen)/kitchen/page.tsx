'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, KitchenTask, KitchenBoardResponse, StationRequest, PlanSubRecipeIngredient } from '../../lib/api';

const STATIONS = [
  'Veg Station',
  'Protein Station',
  'Oven Station',
  'Sauce Station',
  'Breakfast + Sides Station',
  'Packaging Station',
];

type LogStatus = 'not_started' | 'in_progress' | 'done';

interface LogModal {
  task: KitchenTask;
  qty: string;
  weight: string;
  notes: string;
}

interface FeedbackModal {
  task: KitchenTask;
  rating: number;
  comment: string;
}

interface RequestModal {
  task: KitchenTask;
  toStation: string;
  description: string;
  qty: string;
  unit: string;
}

export default function KitchenBoardPage() {
  const [board, setBoard] = useState<KitchenBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [logModal, setLogModal] = useState<LogModal | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModal | null>(null);
  const [requestModal, setRequestModal] = useState<RequestModal | null>(null);
  const [saving, setSaving] = useState(false);

  // Expanded ingredients / instructions per task
  const [expandedIngredients, setExpandedIngredients] = useState<Set<string>>(new Set());
  const [expandedInstructions, setExpandedInstructions] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setError('');
      const data = await api.getKitchenBoard();
      setBoard(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Status update ────────────────────────────────────────────────────────
  async function handleStatusChange(task: KitchenTask, status: LogStatus) {
    if (!board?.plan) return;
    try {
      await api.upsertProductionLog({
        plan_id: board.plan.id,
        sub_recipe_id: task.sub_recipe_id,
        status,
        qty_cooked: task.log.qty_cooked ?? undefined,
        weight_recorded: task.log.weight_recorded ?? undefined,
        notes: task.log.notes ?? undefined,
      });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.sub_recipe_id === task.sub_recipe_id
              ? { ...t, log: { ...t.log, status } }
              : t
          ),
        };
      });
    } catch (e: any) {
      alert(e.message ?? 'Failed to update status');
    }
  }

  // ─── Log Cooked save ──────────────────────────────────────────────────────
  async function saveLog() {
    if (!logModal || !board?.plan) return;
    setSaving(true);
    try {
      await api.upsertProductionLog({
        plan_id: board.plan.id,
        sub_recipe_id: logModal.task.sub_recipe_id,
        status: logModal.task.log.status,
        qty_cooked: logModal.qty ? parseFloat(logModal.qty) : undefined,
        weight_recorded: logModal.weight ? parseFloat(logModal.weight) : undefined,
        notes: logModal.notes || undefined,
      });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.sub_recipe_id === logModal.task.sub_recipe_id
              ? {
                  ...t,
                  log: {
                    ...t.log,
                    qty_cooked: logModal.qty ? parseFloat(logModal.qty) : null,
                    weight_recorded: logModal.weight ? parseFloat(logModal.weight) : null,
                    notes: logModal.notes || null,
                  },
                }
              : t
          ),
        };
      });
      setLogModal(null);
    } catch (e: any) {
      alert(e.message ?? 'Failed to save log');
    } finally {
      setSaving(false);
    }
  }

  // ─── Feedback save ────────────────────────────────────────────────────────
  async function saveFeedback() {
    if (!feedbackModal || !board?.plan) return;
    setSaving(true);
    try {
      await api.submitKitchenFeedback({
        sub_recipe_id: feedbackModal.task.sub_recipe_id,
        plan_id: board.plan.id,
        rating: feedbackModal.rating,
        comment: feedbackModal.comment || undefined,
      });
      setFeedbackModal(null);
    } catch (e: any) {
      alert(e.message ?? 'Failed to submit feedback');
    } finally {
      setSaving(false);
    }
  }

  // ─── Request save ─────────────────────────────────────────────────────────
  async function saveRequest() {
    if (!requestModal || !board?.plan) return;
    if (!requestModal.toStation) { alert('Please select a station'); return; }
    if (!requestModal.description.trim()) { alert('Please enter a description'); return; }
    setSaving(true);
    try {
      await api.createStationRequest({
        to_station: requestModal.toStation,
        description: requestModal.description,
        quantity: requestModal.qty ? parseFloat(requestModal.qty) : undefined,
        unit: requestModal.unit || undefined,
        sub_recipe_id: requestModal.task.sub_recipe_id,
        plan_id: board.plan.id,
      });
      setRequestModal(null);
    } catch (e: any) {
      alert(e.message ?? 'Failed to send request');
    } finally {
      setSaving(false);
    }
  }

  // ─── Acknowledge/complete incoming request ────────────────────────────────
  async function handleRequestStatus(requestId: string, status: 'acknowledged' | 'completed') {
    try {
      await api.updateStationRequestStatus(requestId, status);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pendingRequests: prev.pendingRequests.map((r) =>
            r.id === requestId ? { ...r, status } : r
          ).filter((r) => r.status !== 'completed'),
        };
      });
    } catch (e: any) {
      alert(e.message ?? 'Failed to update request');
    }
  }

  function toggleIngredients(id: string) {
    setExpandedIngredients((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleInstructions(id: string) {
    setExpandedInstructions((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-10 h-10 bg-brand-500 rounded-xl mx-auto mb-3 flex items-center justify-center animate-pulse">
            <span className="text-white font-bold">C</span>
          </div>
          <p className="text-sm text-gray-500">Loading your board...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 text-sm">{error}</p>
        <button onClick={load} className="mt-3 text-brand-600 text-sm underline">Retry</button>
      </div>
    );
  }

  if (!board?.plan) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-3">📅</p>
        <h2 className="text-lg font-semibold text-gray-700">No active production plan</h2>
        <p className="text-sm text-gray-500 mt-1">Ask your admin to create a plan for this week.</p>
      </div>
    );
  }

  const pendingCount = board.pendingRequests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Week label */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Your Tasks</h1>
          <p className="text-sm text-gray-500">{board.plan.week_label}</p>
        </div>
        <div className="text-sm text-gray-500">
          {board.tasks.filter((t) => t.log.status === 'done').length}/{board.tasks.length} done
        </div>
      </div>

      {/* Pending incoming requests banner */}
      {board.pendingRequests.length > 0 && (
        <div className="space-y-2">
          {board.pendingRequests.map((req) => (
            <div
              key={req.id}
              className={`rounded-xl border p-3 ${
                req.status === 'pending'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {req.status === 'pending' ? '🔴' : '🟡'}{' '}
                    Request from {req.from_user?.station ?? 'Unknown Station'}
                  </p>
                  <p className="text-sm text-gray-700 mt-0.5">{req.description}</p>
                  {req.quantity && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Qty: {req.quantity} {req.unit}
                    </p>
                  )}
                  {req.sub_recipe && (
                    <p className="text-xs text-gray-500">
                      Re: {req.sub_recipe.display_name || req.sub_recipe.name}
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {req.status === 'pending' && (
                    <button
                      onClick={() => handleRequestStatus(req.id, 'acknowledged')}
                      className="px-2.5 py-1 text-xs bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                    >
                      Ack
                    </button>
                  )}
                  <button
                    onClick={() => handleRequestStatus(req.id, 'completed')}
                    className="px-2.5 py-1 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task cards */}
      {board.tasks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-gray-500 text-sm">No tasks assigned to your station this week.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {board.tasks.map((task) => {
            const isDone = task.log.status === 'done';
            const isInProgress = task.log.status === 'in_progress';
            return (
              <div
                key={task.sub_recipe_id}
                className={`bg-white rounded-xl border transition-all ${
                  isDone
                    ? 'border-gray-200 opacity-75'
                    : isInProgress
                    ? 'border-brand-300 shadow-sm'
                    : 'border-gray-200'
                }`}
              >
                {/* Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          P{task.priority}
                        </span>
                        <h3 className={`text-sm font-semibold ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {task.display_name || task.name}
                        </h3>
                        {isDone && <span className="text-green-500 text-sm">✓</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {task.total_quantity.toFixed(2)} {task.unit} needed
                        {task.log.qty_cooked != null && (
                          <span className="ml-1.5 text-green-600">
                            · {task.log.qty_cooked} cooked
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Expandable sections */}
                  <div className="flex gap-2 mt-3">
                    {task.ingredients.length > 0 && (
                      <button
                        onClick={() => toggleIngredients(task.sub_recipe_id)}
                        className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                      >
                        Ingredients {expandedIngredients.has(task.sub_recipe_id) ? '▲' : '▾'}
                      </button>
                    )}
                    {task.instructions && (
                      <button
                        onClick={() => toggleInstructions(task.sub_recipe_id)}
                        className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                      >
                        Instructions {expandedInstructions.has(task.sub_recipe_id) ? '▲' : '▾'}
                      </button>
                    )}
                  </div>

                  {/* Ingredient list */}
                  {expandedIngredients.has(task.sub_recipe_id) && task.ingredients.length > 0 && (
                    <div className="mt-3 bg-gray-50 rounded-lg p-3 space-y-1">
                      {task.ingredients.map((ing: PlanSubRecipeIngredient, i: number) => (
                        <div key={i} className="flex justify-between text-xs text-gray-700">
                          <span>{ing.name}</span>
                          <span className="font-medium">
                            {ing.quantity.toFixed(2)} {ing.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Instructions */}
                  {expandedInstructions.has(task.sub_recipe_id) && task.instructions && (
                    <div className="mt-3 bg-blue-50 rounded-lg p-3">
                      <p className="text-xs text-gray-700 whitespace-pre-wrap">{task.instructions}</p>
                    </div>
                  )}

                  {/* Status buttons */}
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {(['not_started', 'in_progress', 'done'] as LogStatus[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(task, s)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                          task.log.status === s
                            ? s === 'done'
                              ? 'bg-green-500 text-white border-green-500'
                              : s === 'in_progress'
                              ? 'bg-brand-500 text-white border-brand-500'
                              : 'bg-gray-200 text-gray-700 border-gray-300'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {s === 'not_started' ? '○ Not Started' : s === 'in_progress' ? '▶ In Progress' : '✓ Done'}
                      </button>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button
                      onClick={() => setLogModal({
                        task,
                        qty: task.log.qty_cooked?.toString() ?? '',
                        weight: task.log.weight_recorded?.toString() ?? '',
                        notes: task.log.notes ?? '',
                      })}
                      className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                    >
                      📝 Log Cooked
                    </button>
                    <button
                      onClick={() => setFeedbackModal({ task, rating: 5, comment: '' })}
                      className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                    >
                      ⭐ Feedback
                    </button>
                    <button
                      onClick={() => setRequestModal({
                        task,
                        toStation: '',
                        description: '',
                        qty: '',
                        unit: 'Kgs',
                      })}
                      className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                    >
                      → Request
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Log Cooked Modal ───────────────────────────────────────────────── */}
      {logModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-base font-bold text-gray-900 mb-1">Log Cooked</h2>
            <p className="text-xs text-gray-500 mb-4">{logModal.task.display_name || logModal.task.name}</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Qty Cooked</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={logModal.qty}
                  onChange={(e) => setLogModal({ ...logModal, qty: e.target.value })}
                  placeholder={`e.g. ${logModal.task.total_quantity.toFixed(2)}`}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Weight Recorded (Kgs)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={logModal.weight}
                  onChange={(e) => setLogModal({ ...logModal, weight: e.target.value })}
                  placeholder="e.g. 4.5"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Notes</label>
                <textarea
                  rows={2}
                  value={logModal.notes}
                  onChange={(e) => setLogModal({ ...logModal, notes: e.target.value })}
                  placeholder="Any notes..."
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setLogModal(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveLog}
                disabled={saving}
                className="flex-1 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback Modal ─────────────────────────────────────────────────── */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-base font-bold text-gray-900 mb-1">Recipe Feedback</h2>
            <p className="text-xs text-gray-500 mb-4">
              {feedbackModal.task.display_name || feedbackModal.task.name}
            </p>

            {/* Star rating */}
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-700 block mb-2">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setFeedbackModal({ ...feedbackModal, rating: star })}
                    className="text-2xl leading-none transition-transform hover:scale-110"
                  >
                    {star <= feedbackModal.rating ? '⭐' : '☆'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700">Comment</label>
              <textarea
                rows={3}
                value={feedbackModal.comment}
                onChange={(e) => setFeedbackModal({ ...feedbackModal, comment: e.target.value })}
                placeholder="What went well? What could improve?"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setFeedbackModal(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveFeedback}
                disabled={saving}
                className="flex-1 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Station Request Modal ──────────────────────────────────────────── */}
      {requestModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-base font-bold text-gray-900 mb-1">Request from Station</h2>
            <p className="text-xs text-gray-500 mb-4">
              {requestModal.task.display_name || requestModal.task.name}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Send to Station</label>
                <select
                  value={requestModal.toStation}
                  onChange={(e) => setRequestModal({ ...requestModal, toStation: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select station...</option>
                  {STATIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Description</label>
                <textarea
                  rows={2}
                  value={requestModal.description}
                  onChange={(e) => setRequestModal({ ...requestModal, description: e.target.value })}
                  placeholder="What do you need? e.g. Need 2 Kgs of julienne carrots"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-700">Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={requestModal.qty}
                    onChange={(e) => setRequestModal({ ...requestModal, qty: e.target.value })}
                    placeholder="0"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-700">Unit</label>
                  <select
                    value={requestModal.unit}
                    onChange={(e) => setRequestModal({ ...requestModal, unit: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option>Kgs</option>
                    <option>gr</option>
                    <option>L</option>
                    <option>ml</option>
                    <option>pcs</option>
                    <option>oz</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setRequestModal(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveRequest}
                disabled={saving}
                className="flex-1 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
