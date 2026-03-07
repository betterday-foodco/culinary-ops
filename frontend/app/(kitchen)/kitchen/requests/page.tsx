'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, StationRequest } from '../../../lib/api';

interface RequestsData {
  incoming: StationRequest[];
  sent: StationRequest[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: '🔴 Pending',
  acknowledged: '🟡 Acknowledged',
  completed: '✅ Completed',
};

export default function KitchenRequestsPage() {
  const [data, setData] = useState<RequestsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await api.getStationRequests();
      setData(res);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleStatus(id: string, status: 'acknowledged' | 'completed') {
    try {
      await api.updateStationRequestStatus(id, status);
      await load();
    } catch (e: any) {
      alert(e.message ?? 'Failed to update');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-500 animate-pulse">Loading requests...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 text-sm">{error}</p>
        <button onClick={load} className="mt-3 text-brand-600 text-sm underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Incoming requests */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          Incoming Requests
          {data?.incoming.filter((r) => r.status !== 'completed').length ? (
            <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
              {data.incoming.filter((r) => r.status !== 'completed').length} active
            </span>
          ) : null}
        </h2>

        {!data?.incoming.length ? (
          <p className="text-sm text-gray-400 py-4 text-center">No incoming requests</p>
        ) : (
          <div className="space-y-3">
            {data.incoming.map((req) => (
              <div
                key={req.id}
                className={`bg-white rounded-xl border p-4 ${
                  req.status === 'pending'
                    ? 'border-red-200'
                    : req.status === 'acknowledged'
                    ? 'border-yellow-200'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500">
                        From: <strong>{req.from_user?.station ?? 'Unknown'}</strong>
                        {req.from_user?.name ? ` (${req.from_user.name})` : ''}
                      </span>
                      <span className="text-xs">{STATUS_LABEL[req.status]}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 mt-1">{req.description}</p>
                    {req.quantity && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Qty: {req.quantity} {req.unit}
                      </p>
                    )}
                    {req.sub_recipe && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Re: {req.sub_recipe.display_name || req.sub_recipe.name}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(req.created_at).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {req.status !== 'completed' && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      {req.status === 'pending' && (
                        <button
                          onClick={() => handleStatus(req.id, 'acknowledged')}
                          className="px-3 py-1.5 text-xs bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        onClick={() => handleStatus(req.id, 'completed')}
                        className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600"
                      >
                        Complete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sent requests */}
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-3">Sent Requests</h2>

        {!data?.sent.length ? (
          <p className="text-sm text-gray-400 py-4 text-center">No sent requests</p>
        ) : (
          <div className="space-y-3">
            {data.sent.map((req) => (
              <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500">
                        To: <strong>{req.to_station}</strong>
                      </span>
                      <span className="text-xs">{STATUS_LABEL[req.status]}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 mt-1">{req.description}</p>
                    {req.quantity && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Qty: {req.quantity} {req.unit}
                      </p>
                    )}
                    {req.sub_recipe && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Re: {req.sub_recipe.display_name || req.sub_recipe.name}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(req.created_at).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
