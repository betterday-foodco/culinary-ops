'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { corpAuth, setCorpToken, getCorpUser } from '../../../lib/corp-api';

// ── DM Sans font injection ────────────────────────────────────────────────────
const FONT_LINK = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap';

// ── CSS variables matching work.html palette ─────────────────────────────────
const dark    = '#00465e';
const primary = '#4ea2fd';
const green   = '#27ae60';
const red     = '#e74c3c';
const cream   = '#faebda';

type Step = 'gate' | 'company' | 'manager-pin' | 'employee-email' | 'magic-sent';

export default function CorporateLoginPage() {
  const router       = useRouter();
  const params       = useSearchParams();
  const [step, setStep]             = useState<Step>('gate');
  const [mode, setMode]             = useState<'employee' | 'manager' | null>(null);
  const [companyId, setCompanyId]   = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail]           = useState('');
  const [pin, setPin]               = useState('');
  const [pinError, setPinError]     = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const pinRef = useRef<string>('');

  // Redirect if already logged in
  useEffect(() => {
    const user = getCorpUser();
    if (user) {
      router.replace(user.role === 'corp_manager' ? '/corporate/manager' : '/corporate/work');
    }
  }, [router]);

  // Load font
  useEffect(() => {
    if (!document.querySelector(`link[href="${FONT_LINK}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);

  function chooseMode(m: 'employee' | 'manager') {
    setMode(m);
    setStep('company');
    setError('');
  }

  function submitCompanyId() {
    const id = companyId.trim().toUpperCase();
    if (!id) { setError('Please enter your company code'); return; }
    setCompanyId(id);
    setCompanyName(id); // Will be replaced by real name post-login
    setError('');
    setStep(mode === 'manager' ? 'manager-pin' : 'employee-email');
  }

  async function submitManagerPin() {
    if (pinRef.current.length < 4) return;
    setLoading(true);
    setError('');
    try {
      const res = await corpAuth.managerLogin(companyId, pinRef.current);
      setCorpToken(res.access_token, res.user);
      router.replace('/corporate/manager');
    } catch (e: any) {
      setPinError(true);
      setPin('');
      pinRef.current = '';
      setError(e.message ?? 'Incorrect PIN');
      setTimeout(() => setPinError(false), 700);
    } finally {
      setLoading(false);
    }
  }

  async function submitEmail() {
    const em = email.trim().toLowerCase();
    if (!em || !em.includes('@')) { setError('Please enter a valid email address'); return; }
    setLoading(true);
    setError('');
    try {
      await corpAuth.requestMagicLink(em, companyId);
      setStep('magic-sent');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function handlePinKey(key: string) {
    if (loading) return;
    if (key === 'del') {
      if (pinRef.current.length > 0) {
        pinRef.current = pinRef.current.slice(0, -1);
        setPin(pinRef.current);
      }
      return;
    }
    if (pinRef.current.length >= 4) return;
    pinRef.current += key;
    setPin(pinRef.current);
    if (pinRef.current.length === 4) submitManagerPin();
  }

  // ── Shared card wrapper ───────────────────────────────────────────────────

  function AuthCard({ children }: { children: React.ReactNode }) {
    return (
      <div style={{
        minHeight: '100vh', background: cream,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '24px',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{
            background: '#fff', borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 4px 24px rgba(0,0,0,.06)',
            border: '1px solid #E8DFD2',
          }}>
            {/* Brand bar */}
            <div style={{ background: '#003141', padding: '28px 36px', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{
                  width: '36px', height: '36px', background: '#F5C400',
                  borderRadius: '10px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 900, fontSize: '.85rem', color: '#003141',
                }}>BD</div>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: '1.15rem' }}>BetterDay for Work</span>
              </div>
              <p style={{ fontSize: '.62rem', color: 'rgba(250,235,218,.5)', fontWeight: 400, letterSpacing: '2px', textTransform: 'uppercase' }}>
                Employee Meal Benefits
              </p>
            </div>
            {/* Content */}
            <div style={{ padding: '32px 36px 36px' }}>
              {/* Company splash (step 2+) */}
              {companyId && step !== 'company' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: 'rgba(0,70,94,.06)', borderRadius: '12px',
                  padding: '10px 14px', marginBottom: '20px',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: dark, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '.8rem', fontWeight: 900, color: '#fff', flexShrink: 0,
                  }}>{companyId.slice(0, 2)}</div>
                  <div>
                    <div style={{ fontSize: '.88rem', fontWeight: 800, color: dark }}>{companyName}</div>
                    <div style={{ fontSize: '.72rem', color: '#7b8c9f' }}>Company Portal</div>
                  </div>
                  <button
                    onClick={() => { setStep('company'); setPin(''); pinRef.current = ''; setError(''); }}
                    style={{ marginLeft: 'auto', fontSize: '.72rem', color: primary, cursor: 'pointer', border: 'none', background: 'transparent', fontWeight: 700 }}
                  >Change</button>
                </div>
              )}
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ErrorMsg() {
    if (!error) return null;
    return (
      <div style={{
        background: 'rgba(231,76,60,.07)', border: '1px solid rgba(231,76,60,.2)',
        borderRadius: '10px', padding: '10px 12px', marginBottom: '12px',
        fontSize: '.82rem', color: red, fontWeight: 600,
      }}>{error}</div>
    );
  }

  // ── Step: Gate (choose employee / manager) ────────────────────────────────
  if (step === 'gate') {
    return (
      <AuthCard>
        <p style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: primary, marginBottom: '5px' }}>Welcome</p>
        <h1 style={{ fontSize: '1.65rem', fontWeight: 900, color: dark, lineHeight: 1.15, marginBottom: '5px' }}>How can we help?</h1>
        <p style={{ fontSize: '.88rem', color: '#7b8c9f', lineHeight: 1.5, marginBottom: '22px' }}>Select your role to continue.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { m: 'employee' as const, icon: '🥗', title: 'Order My Meals', sub: 'Browse this week\'s menu and place an order' },
            { m: 'manager' as const, icon: '📊', title: 'Manager Login', sub: 'View orders, employees, and billing' },
          ].map(({ m, icon, title, sub }) => (
            <button
              key={m}
              onClick={() => chooseMode(m)}
              style={{
                width: '100%', background: '#fff', border: '2px solid #e8f0f4',
                borderRadius: '16px', padding: '22px 20px', textAlign: 'left',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px',
                transition: 'border-color .18s, box-shadow .18s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = primary; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e8f0f4'; }}
            >
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(0,70,94,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>{icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: dark, marginBottom: '2px' }}>{title}</div>
                <div style={{ fontSize: '.78rem', color: '#7b8c9f' }}>{sub}</div>
              </div>
              <div style={{ fontSize: '1.1rem', color: '#c5d4dc' }}>›</div>
            </button>
          ))}
        </div>
      </AuthCard>
    );
  }

  // ── Step: Company Code ────────────────────────────────────────────────────
  if (step === 'company') {
    return (
      <AuthCard>
        <p style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: primary, marginBottom: '5px' }}>Step 1</p>
        <h1 style={{ fontSize: '1.65rem', fontWeight: 900, color: dark, lineHeight: 1.15, marginBottom: '5px' }}>Your company</h1>
        <p style={{ fontSize: '.88rem', color: '#7b8c9f', lineHeight: 1.5, marginBottom: '22px' }}>Enter your company code to continue.</p>
        <ErrorMsg />
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 800, color: dark, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '.4px' }}>Company Code</label>
          <input
            value={companyId}
            onChange={e => setCompanyId(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && submitCompanyId()}
            placeholder="e.g. DEMO"
            autoFocus
            style={{
              width: '100%', padding: '13px 16px', border: '2px solid #e8edf2',
              borderRadius: '12px', fontSize: '1.1rem', fontFamily: "'DM Sans', sans-serif",
              color: dark, background: '#f8fafc', outline: 'none',
              textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 800, textAlign: 'center',
            }}
          />
        </div>
        <button
          onClick={submitCompanyId}
          style={{ width: '100%', padding: '15px', background: dark, color: '#fff', border: 'none', borderRadius: '14px', fontFamily: "'DM Sans', sans-serif", fontSize: '1rem', fontWeight: 800, cursor: 'pointer', marginTop: '4px' }}
        >Continue →</button>
        <button
          onClick={() => { setStep('gate'); setError(''); }}
          style={{ width: '100%', padding: '13px', background: 'transparent', color: dark, border: '2px solid #e0e8f0', borderRadius: '14px', fontFamily: "'DM Sans', sans-serif", fontSize: '.9rem', fontWeight: 700, cursor: 'pointer', marginTop: '8px' }}
        >← Back</button>
      </AuthCard>
    );
  }

  // ── Step: Manager PIN ─────────────────────────────────────────────────────
  if (step === 'manager-pin') {
    return (
      <AuthCard>
        <p style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: primary, marginBottom: '5px' }}>Manager Access</p>
        <h1 style={{ fontSize: '1.65rem', fontWeight: 900, color: dark, lineHeight: 1.15, marginBottom: '22px' }}>Enter PIN</h1>
        <ErrorMsg />
        {/* PIN dots */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '16px' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: '14px', height: '14px', borderRadius: '50%',
              border: `2px solid ${pinError ? red : pin.length > i ? dark : '#d0d8e0'}`,
              background: pinError ? red : pin.length > i ? dark : 'transparent',
              transition: '.15s',
            }} />
          ))}
        </div>
        {/* PIN grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '14px' }}>
          {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) => {
            if (k === '') return <div key={i} />;
            return (
              <button
                key={k}
                onClick={() => handlePinKey(k)}
                style={{
                  background: k === 'del' ? 'transparent' : '#f0f4f8',
                  border: 'none', borderRadius: '12px', padding: '14px',
                  fontSize: k === 'del' ? '.9rem' : '1.1rem',
                  fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                  color: k === 'del' ? '#7b8c9f' : dark, cursor: 'pointer',
                }}
              >{k === 'del' ? '⌫' : k}</button>
            );
          })}
        </div>
        {loading && <div style={{ textAlign: 'center', color: '#7b8c9f', fontSize: '.85rem' }}>Verifying…</div>}
        <button
          onClick={() => { setStep('company'); setPin(''); pinRef.current = ''; setError(''); }}
          style={{ width: '100%', padding: '13px', background: 'transparent', color: dark, border: '2px solid #e0e8f0', borderRadius: '14px', fontFamily: "'DM Sans', sans-serif", fontSize: '.9rem', fontWeight: 700, cursor: 'pointer', marginTop: '8px' }}
        >← Back</button>
      </AuthCard>
    );
  }

  // ── Step: Employee email ──────────────────────────────────────────────────
  if (step === 'employee-email') {
    return (
      <AuthCard>
        <p style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: primary, marginBottom: '5px' }}>Order My Meals</p>
        <h1 style={{ fontSize: '1.65rem', fontWeight: 900, color: dark, lineHeight: 1.15, marginBottom: '5px' }}>Enter your email</h1>
        <p style={{ fontSize: '.88rem', color: '#7b8c9f', lineHeight: 1.5, marginBottom: '22px' }}>We'll send a secure login link to your work email.</p>
        <ErrorMsg />
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 800, color: dark, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '.4px' }}>Work Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitEmail()}
            placeholder="you@company.com"
            autoFocus
            style={{
              width: '100%', padding: '13px 16px', border: '2px solid #e8edf2',
              borderRadius: '12px', fontSize: '.95rem', fontFamily: "'DM Sans', sans-serif",
              color: dark, background: '#f8fafc', outline: 'none',
            }}
          />
        </div>
        <button
          onClick={submitEmail}
          disabled={loading}
          style={{ width: '100%', padding: '15px', background: loading ? '#93adb8' : dark, color: '#fff', border: 'none', borderRadius: '14px', fontFamily: "'DM Sans', sans-serif", fontSize: '1rem', fontWeight: 800, cursor: loading ? 'default' : 'pointer', marginTop: '4px' }}
        >{loading ? 'Sending…' : 'Send Magic Link ✉️'}</button>
        <button
          onClick={() => { setStep('company'); setError(''); }}
          style={{ width: '100%', padding: '13px', background: 'transparent', color: dark, border: '2px solid #e0e8f0', borderRadius: '14px', fontFamily: "'DM Sans', sans-serif", fontSize: '.9rem', fontWeight: 700, cursor: 'pointer', marginTop: '8px' }}
        >← Back</button>
      </AuthCard>
    );
  }

  // ── Step: Magic link sent ─────────────────────────────────────────────────
  if (step === 'magic-sent') {
    return (
      <AuthCard>
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: '12px' }}>✉️</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: dark, marginBottom: '6px' }}>Check your inbox</h2>
          <p style={{ fontSize: '.85rem', color: '#7b8c9f', lineHeight: 1.6, marginBottom: '18px' }}>
            We sent a login link to <strong>{email}</strong>. It expires in 15 minutes.
          </p>
          <p style={{ fontSize: '.78rem', color: '#7b8c9f' }}>
            Didn't get it?{' '}
            <button
              onClick={() => { setStep('employee-email'); setError(''); }}
              style={{ fontSize: '.78rem', color: primary, cursor: 'pointer', border: 'none', background: 'transparent', fontWeight: 700 }}
            >Resend link</button>
          </p>
        </div>
      </AuthCard>
    );
  }

  return null;
}
