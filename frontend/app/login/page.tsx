'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(email, password);
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('user_id', res.user.id);
      localStorage.setItem('user_role', res.user.role);
      localStorage.setItem('user_station', res.user.station ?? '');
      localStorage.setItem('user_name', res.user.name ?? '');
      localStorage.setItem('user_station_role', res.user.station_role ?? '');
      router.push(res.user.role === 'kitchen' ? '/kitchen' : '/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        backgroundImage: 'url(/login-hero.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0e3a6e]/55 via-[#1B6DB5]/40 to-[#0e3a6e]/55" />

      {/* Decorative blobs */}
      <div className="absolute top-[-80px] right-[-80px] w-72 h-72 bg-[#F5C400]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-60px] left-[-60px] w-64 h-64 bg-brand-500/20 rounded-full blur-3xl pointer-events-none" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">

        {/* Logo + brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#F5C400] rounded-2xl shadow-xl mb-4">
            <span className="text-[#1B6DB5] font-black text-xl tracking-tight">BD</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">BetterDay Kitchen</h1>
          <p className="text-white/60 text-sm mt-1 tracking-wide uppercase">Production Operations System</p>
        </div>

        {/* Form card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Welcome back</h2>
            <p className="text-white/60 text-sm mt-0.5">Sign in to your kitchen portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/25 rounded-xl text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#F5C400] focus:border-transparent transition-all"
                placeholder="team@eatbetterday.ca"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/80 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/25 rounded-xl text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#F5C400] focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2.5 bg-red-500/20 border border-red-400/40 text-red-200 px-4 py-3 rounded-xl text-sm">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#F5C400] hover:bg-yellow-400 active:scale-[0.98] disabled:opacity-60 text-[#1B3A6B] font-black rounded-xl text-sm transition-all shadow-lg shadow-yellow-500/30 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-[#1B3A6B]/40 border-t-[#1B3A6B] rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in →'
              )}
            </button>
          </form>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mt-6">
          {['Station Board', 'Cooking Reports', 'Inventory Lists', 'Production Logs'].map((f) => (
            <span
              key={f}
              className="px-3 py-1 bg-white/10 backdrop-blur-sm text-white/70 text-xs font-medium rounded-full border border-white/15"
            >
              {f}
            </span>
          ))}
        </div>

        <p className="text-center text-white/30 text-xs mt-5">
          BetterDay Food Co. · Kitchen Operations
        </p>
      </div>
    </div>
  );
}
