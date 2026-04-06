'use client';
// MealPrep integration settings
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

export default function IntegrationSettingsPage() {
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tokenSet, setTokenSet] = useState(false);
  const [secretSet, setSecretSet] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [hookUrl, setHookUrl] = useState('');

  useEffect(() => {
    setHookUrl(`${window.location.protocol}//${window.location.hostname}:3002/api/webhooks/mealprep-order`);
    api.getIntegrationConfig().then((c) => {
      setEndpoint(c.mealprep_api_endpoint ?? '');
      setTokenSet(!!c.mealprep_api_token_set);
      setSecretSet(!!c.mealprep_webhook_secret_set);
    }).catch(() => {});
    api.getWebhookLogs().then(setWebhookLogs).catch(() => {}).finally(() => setLogsLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const data: Record<string, string> = {};
      if (endpoint.trim()) data['mealprep_api_endpoint'] = endpoint.trim();
      if (token.trim()) data['mealprep_api_token'] = token.trim();
      if (webhookSecret.trim()) data['mealprep_webhook_secret'] = webhookSecret.trim();
      await api.saveIntegrationConfig(data);
      setSaved(true);
      if (token.trim()) setTokenSet(true);
      if (webhookSecret.trim()) setSecretSet(true);
      setToken('');
      setWebhookSecret('');
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }


  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">MealPrep Platform Integration</h1>
        <p className="text-sm text-gray-500 mt-1">Configure the connection between BetterDay and your ordering platform.</p>
      </div>

      {/* Webhook URL — send to them */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-blue-900 mb-1">Your Webhook URL (send this to MealPrep)</h2>
        <p className="text-xs text-blue-700 mb-3">
          Ask them to send order webhooks to this endpoint. When they post orders here, BetterDay automatically creates or updates your production plan for that week.
        </p>
        <div className="flex items-center gap-2">
          <code suppressHydrationWarning className="flex-1 bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm font-mono text-blue-900 select-all">
            {hookUrl}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(hookUrl)}
            className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
          >
            Copy
          </button>
        </div>
        <div className="mt-3 text-xs text-blue-700">
          <strong>Method:</strong> POST &nbsp;|&nbsp;
          <strong>Content-Type:</strong> application/json &nbsp;|&nbsp;
          <strong>Auth:</strong> X-Webhook-Secret header (set below)
        </div>
      </div>

      {/* API config */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-900">API Credentials</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Their API Endpoint (replace/weekly menu)</label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.mealprep.com/v1/menu/replace"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-gray-400 mt-1">Leave blank until they share it. The Publish button will activate once this is set.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Their Bearer Token (API key they gave you)
            {tokenSet && <span className="ml-2 text-xs text-green-600 font-normal">✓ saved</span>}
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={tokenSet ? '•••• already saved — paste new value to update' : 'sk_live_...'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Webhook Secret (you choose this — share with them)
            {secretSet && <span className="ml-2 text-xs text-green-600 font-normal">✓ saved</span>}
          </label>
          <input
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder={secretSet ? '•••• already saved — paste new value to update' : 'Pick any strong random string'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            BetterDay will check that every incoming webhook includes this in the <code>X-Webhook-Secret</code> header.
            Leave blank to accept unsigned webhooks (fine for testing).
          </p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
        </div>
      </div>

      {/* Webhook logs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Recent Webhook Calls</h2>
          <button onClick={() => { setLogsLoading(true); api.getWebhookLogs().then(setWebhookLogs).catch(() => {}).finally(() => setLogsLoading(false)); }} className="text-xs text-brand-600 hover:underline">Refresh</button>
        </div>
        {logsLoading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Loading...</div>
        ) : webhookLogs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No webhooks received yet. Once MealPrep starts sending orders, they'll appear here.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Time', 'Source', 'Event', 'Status', 'Result'].map((h) => (
                  <th key={h} className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {webhookLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{new Date(log.received_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-medium text-gray-700">{log.source}</td>
                  <td className="px-4 py-2 text-gray-600">{log.event_type ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      log.status === 'processed' ? 'bg-green-50 text-green-700' :
                      log.status === 'error' ? 'bg-red-50 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{log.status}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 max-w-xs truncate">
                    {log.result ? (
                      <span title={JSON.stringify(log.result)}>
                        {(log.result as any).action === 'created' ? '✅ Plan created' :
                         (log.result as any).action === 'updated' ? '🔄 Plan updated' :
                         JSON.stringify(log.result).slice(0, 60)}
                      </span>
                    ) : log.error ? (
                      <span className="text-red-500">{log.error}</span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
