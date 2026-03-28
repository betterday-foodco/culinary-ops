'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, KitchenMessage, KitchenStaff } from '../../lib/api';

const STATIONS = [
  'Veg Station', 'Protein Station', 'Sauce Station',
  'Oven Station', 'Breakfast + Sides Station', 'Packaging Station',
];

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export default function AdminKitchenMessagesPage() {
  const [messages, setMessages] = useState<KitchenMessage[]>([]);
  const [staff, setStaff] = useState<KitchenStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState('');
  const [toType, setToType] = useState<'all' | 'station' | 'user'>('all');
  const [toStation, setToStation] = useState('');
  const [toUserId, setToUserId] = useState('');
  const myId = typeof window !== 'undefined' ? localStorage.getItem('user_id') ?? '' : '';
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [msgs, staffList] = await Promise.all([
        api.getAllKitchenMessages(),
        api.getKitchenStaff(),
      ]);
      setMessages(msgs.reverse());
      setStaff(staffList);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const payload: { body: string; to_station?: string; to_user_id?: string } = { body: body.trim() };
      if (toType === 'station' && toStation) payload.to_station = toStation;
      if (toType === 'user' && toUserId) payload.to_user_id = toUserId;
      const msg = await api.sendKitchenMessage(payload);
      setMessages(prev => [...prev, msg]);
      setBody('');
    } catch (e: any) {
      alert(e.message ?? 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-xl font-black text-gray-900">Kitchen Messages</h1>
          <p className="text-sm text-gray-500 mt-0.5">Send messages to kitchen staff or stations</p>
        </div>
        <button onClick={load} className="text-xs text-brand-600 hover:text-brand-700 font-semibold">Refresh</button>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto space-y-2 pb-2">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">💬</p>
            <p className="text-gray-500 font-semibold">No messages yet</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.from_user_id === myId;
            const isFromKitchen = msg.from_user.role === 'kitchen';
            return (
              <div key={msg.id} className={`flex flex-col max-w-[80%] ${isMe ? 'ml-auto items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className="text-[10px] font-bold text-gray-400 mb-0.5 px-1">
                    {msg.from_user.name ?? 'Staff'}
                    {msg.from_user.station ? ` · ${msg.from_user.station}` : ''}
                    {isFromKitchen ? ' 👨‍🍳' : ''}
                  </span>
                )}
                <div className={`px-4 py-2.5 text-sm shadow-sm rounded-2xl ${
                  isMe
                    ? 'bg-brand-600 text-white rounded-br-sm self-end'
                    : isFromKitchen
                      ? 'bg-green-50 border border-green-200 text-gray-800 rounded-bl-sm'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                }`}>
                  {msg.body}
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                  {isMe && (
                    <>
                      {msg.to_user ? `→ ${msg.to_user.name}` : msg.to_station ? `→ ${msg.to_station}` : '→ All Kitchen'}
                      {' · '}
                    </>
                  )}
                  {timeAgo(msg.created_at)}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mt-2 flex-shrink-0">
        {/* Recipient */}
        <div className="flex gap-1.5 mb-3">
          {[
            { id: 'all', label: '📢 All Kitchen' },
            { id: 'station', label: '📍 Station' },
            { id: 'user', label: '👤 Person' },
          ].map(({ id, label }) => (
            <button key={id} onClick={() => setToType(id as any)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${toType === id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {label}
            </button>
          ))}
        </div>

        {toType === 'station' && (
          <select value={toStation} onChange={e => setToStation(e.target.value)}
            className="w-full mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Pick a station…</option>
            {STATIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {toType === 'user' && (
          <select value={toUserId} onChange={e => setToUserId(e.target.value)}
            className="w-full mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Pick a staff member…</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name} {s.station ? `· ${s.station}` : ''}</option>)}
          </select>
        )}

        <div className="flex gap-2 items-end">
          <textarea rows={2} value={body} onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message… (Enter to send)"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
          <button onClick={send} disabled={sending || !body.trim()}
            className="h-10 w-10 flex items-center justify-center bg-brand-600 text-white rounded-xl disabled:opacity-40 hover:bg-brand-700 transition-colors flex-shrink-0">
            {sending ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
