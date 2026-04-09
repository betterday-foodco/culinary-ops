'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { corpAuth, setCorpToken, getCorpUser } from '../../../lib/corp-api';

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap';
const dark    = '#00465e';
const primary = '#4ea2fd';
const red     = '#e74c3c';
const cream   = '#faebda';

type Step = 'gate' | 'company' | 'manager-pin' | 'employee-auth' | 'employee-pin' | 'magic-sent';
type AuthTab = 'login' | 'join';

export default function CorporateLoginPage() {
  const router = useRouter();
  const [step, setStep]               = useState<Step>('gate');
  const [mode, setMode]               = useState<'employee' | 'manager' | null>(null);
  const [authTab, setAuthTab]         = useState<AuthTab>('login');
  const [companyId, setCompanyId]     = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyValidating, setCompanyValidating] = useState(false);
  const [email, setEmail]             = useState('');
  const [name, setName]               = useState('');
  const [joinPin, setJoinPin]         = useState('');
  const [pin, setPin]                 = useState('');
  const [pinError, setPinError]       = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [empPin, setEmpPin]           = useState('');
  const pinRef = useRef<string>('');
  const empPinRef = useRef<string>('');

  useEffect(() => {
    const user = getCorpUser();
    if (user) router.replace(user.role === 'corp_manager' ? '/corporate/manager' : '/corporate/work');
  }, [router]);

  useEffect(() => {
    if (!document.querySelector(`link[href="${FONT_LINK}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);

  function chooseMode(m: 'employee' | 'manager') {
    setMode(m); setStep('company'); setError('');
  }

  async function submitCompanyId() {
    const id = companyId.trim().toUpperCase();
    if (!id) { setError('Please enter your company code'); return; }
    setCompanyValidating(true); setError('');
    try {
      const res = await corpAuth.getCompany(id);
      setCompanyId(id);
      setCompanyName(res.company.name);
      setStep(mode === 'manager' ? 'manager-pin' : 'employee-auth');
    } catch {
      setError('Company code not found. Check with your manager.');
    } finally {
      setCompanyValidating(false);
    }
  }

  async function submitManagerPin() {
    if (pinRef.current.length < 4) return;
    setLoading(true); setError('');
    try {
      const res = await corpAuth.managerLogin(companyId, pinRef.current);
      setCorpToken(res.access_token, res.user);
      router.replace('/corporate/manager');
    } catch (e: any) {
      setPinError(true); setPin(''); pinRef.current = '';
      setError(e.message ?? 'Incorrect PIN');
      setTimeout(() => setPinError(false), 700);
    } finally {
      setLoading(false);
    }
  }

  async function submitMagicLink() {
    const em = email.trim().toLowerCase();
    if (!em || !em.includes('@')) { setError('Please enter a valid email address'); return; }
    setLoading(true); setError('');
    try {
      const res = await corpAuth.requestMagicLink(em, companyId);
      if ((res as any).dev_token) {
        const verify = await corpAuth.verifyToken((res as any).dev_token);
        setCorpToken(verify.access_token, verify.user);
        router.replace('/corporate/work');
        return;
      }
      setStep('magic-sent');
    } catch (e: any) { setError(e.message ?? 'Something went wrong'); }
    finally { setLoading(false); }
  }

  function goToEmployeePin() {
    const em = email.trim().toLowerCase();
    if (!em || !em.includes('@')) { setError('Please enter a valid email address'); return; }
    setError(''); setEmpPin(''); empPinRef.current = '';
    setStep('employee-pin');
  }

  async function submitEmployeePin() {
    if (empPinRef.current.length < 4) return;
    setLoading(true); setError('');
    try {
      const res = await corpAuth.employeePinLogin(companyId, email.trim().toLowerCase(), empPinRef.current);
      setCorpToken(res.access_token, res.user);
      router.replace('/corporate/work');
    } catch (e: any) {
      setPinError(true); setEmpPin(''); empPinRef.current = '';
      setError(e.message ?? 'Invalid credentials');
      setTimeout(() => setPinError(false), 700);
    } finally { setLoading(false); }
  }

  function handleEmpPinKey(key: string) {
    if (loading) return;
    if (key === 'del') {
      if (empPinRef.current.length > 0) { empPinRef.current = empPinRef.current.slice(0, -1); setEmpPin(empPinRef.current); }
      return;
    }
    if (empPinRef.current.length >= 4) return;
    empPinRef.current += key;
    setEmpPin(empPinRef.current);
    if (empPinRef.current.length === 4) submitEmployeePin();
  }

  async function submitJoin() {
    const em = email.trim().toLowerCase();
    const nm = name.trim();
    if (!nm)                       { setError('Please enter your name'); return; }
    if (!em || !em.includes('@'))  { setError('Please enter a valid email'); return; }
    setLoading(true); setError('');
    try {
      const res = await corpAuth.registerEmployee({
        company_id: companyId, name: nm, email: em,
        ...(joinPin ? { company_pin: joinPin } : {}),
      });
      setCorpToken(res.access_token, res.user);
      router.replace('/corporate/work');
    } catch (e: any) { setError(e.message ?? 'Registration failed'); }
    finally { setLoading(false); }
  }

  function handlePinKey(key: string) {
    if (loading) return;
    if (key === 'del') {
      if (pinRef.current.length > 0) { pinRef.current = pinRef.current.slice(0, -1); setPin(pinRef.current); }
      return;
    }
    if (pinRef.current.length >= 4) return;
    pinRef.current += key; setPin(pinRef.current);
    if (pinRef.current.length === 4) submitManagerPin();
  }

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
            <div style={{ background: '#003141', padding: '28px 36px', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{
                  width: '36px', height: '36px', background: '#F5C400', borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: '.85rem', color: '#003141',
                }}>BD</div>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: '1.15rem' }}>BetterDay for Work</span>
              </div>
              <p style={{ fontSize: '.62rem', color: 'rgba(250,235,218,.5)', fontWeight: 400, letterSpacing: '2px', textTransform: 'uppercase' }}>
                Employee Meal Benefits
              </p>
            </div>
            <div style={{ padding: '32px 36px 36px' }}>
              {companyId && step !== 'company' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: 'rgba(0,70,94,.06)', borderRadius: '12px',
                  padding: '10px 14px', marginBottom: '20px',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px', background: dark,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.8rem', fontWeight: 900, color: '#fff', flexShrink: 0,
                  }}>{companyId.slice(0, 2)}</div>
                  <div>
                    <div style={{ fontSize: '.88rem', fontWeight: 800, color: dark }}>{companyName}</div>
                    <div style={{ fontSize: '.72rem', color: '#7b8c9f' }}>Company Portal</div>
                  </div>
                  <button onClick={() => { setStep('company'); setPin(''); pinRef.current = ''; setError(''); }}
                    style={{ marginLeft: 'auto', fontSize: '.72rem', color: primary, cursor: 'pointer', border: 'none', background: 'transparent', fontWeight: 700 }}>
                    Change
                  </button>
                </div>
              )}
              {error && (
                <div style={{
                  background: 'rgba(231,76,60,.07)', border: '1px solid rgba(231,76,60,.2)',
                  borderRadius: '10px', padding: '10px 12px', marginBottom: '12px',
                  fontSize: '.82rem', color: red, fontWeight: 600,
                }}>{error}</div>
              )}
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '13px 16px', border: '2px solid #e8edf2',
    borderRadius: '12px', fontSize: '.95rem', fontFamily: "'DM Sans', sans-serif",
    color: dark, background: '#f8fafc', outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '.75rem', fontWeight: 800, color: dark,
    marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '.4px',
  };
  function PrimaryBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        width: '100%', padding: '15px', background: disabled ? '#93adb8' : dark,
        color: '#fff', border: 'none', borderRadius: '14px',
        fontFamily: "'DM Sans', sans-serif", fontSize: '1rem', fontWeight: 800,
        cursor: disabled ? 'default' : 'pointer', marginTop: '4px',
      }}>{children}</button>
    );
  }
  function BackBtn({ to }: { to: Step }) {
    return (
      <button onClick={() => { setStep(to); setError(''); }} style={{
        width: '100%', padding: '13px', background: 'transparent', color: dark,
        border: '2px solid #e0e8f0', borderRadius: '14px',
        fontFamily: "'DM Sans', sans-serif", fontSize: '.9rem', fontWeight: 700,
        cursor: 'pointer', marginTop: '8px',
      }}>← Back</button>
    );
  }

  // ── Gate ──────────────────────────────────────────────────────────────────
  if (step === 'gate') return (
    <AuthCard>
      <p style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: primary, marginBottom: '5px' }}>Welcome</p>
      <h1 style={{ fontSize: '1.65rem', fontWeight: 900, color: dark, lineHeight: 1.15, marginBottom: '5px' }}>How can we help?</h1>
      <p style={{ fontSize: '.88rem', color: '#7b8c9f', lineHeight: 1.5, marginBottom: '22px' }}>Select your role to continue.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {[
          { m: 'employee' as const, icon: '🥗', title: 'Order My Meals', sub: "Browse this week's menu and place an order" },
          { m: 'manager' as const, icon: '📊', title: 'Manager Login', sub: 'View orders, employees, and billing' },
        ].map(({ m, icon, title, sub }) => (
          <button key={m} onClick={() => chooseMode(m)} style={{
            width: '100%', background: '#fff', border: '2px solid #e8f0f4',
            borderRadius: '16px', padding: '22px 20px', textAlign: 'left',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px',
          }}>
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

  // ── Company Code ──────────────────────────────────────────────────────────
  if (step === 'company') return (
    <AuthCard>
      <p style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: primary, marginBottom: '5px' }}>Step 1</p>
      <h1 style={{ fontSize: '1.65rem', fontWeight: 900, color: dark, lineHeight: 1.15, marginBottom: '5px' }}>Your company</h1>
      <p style={{ fontSize: '.88rem', color: '#7b8c9f', lineHeight: 1.5, marginBottom: '22px' }}>Enter your company code to continue.</p>
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Company Code</label>
        <input
          value={companyId}
          onChange={e => setCompanyId(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && submitCompanyId()}
          placeholder="e.g. DEMO"
          autoFocus
          style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 800, textAlign: 'center', fontSize: '1.1rem' }}
        />
      </div>
      <PrimaryBtn onClick={submitCompanyId} disabled={companyValidating}>
        {companyValidating ? 'Checking…' : 'Continue →'}
      </PrimaryBtn>
      <BackBtn to="gate" />
    </AuthCard>
  );

  // ── Manager PIN ───────────────────────────────────────────────────────────
  if (step === 'manager-pin') return (
    <AuthCard>
      <p style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: primary, marginBottom: '5px' }}>Manager Access</p>
      <h1 style={{ fontSize: '1.65rem', fontWeight: 900, color: dark, lineHeight: 1.15, marginBottom: '22px' }}>Enter PIN</h1>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '16px' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            width: '14px', height: '14px', borderRadius: '50%',
            border: `2px solid ${pinError ? red : pin.length > i ? dark : '#d0d8e0'}`,
            background: pinError ? red : pin.length > i ? dark : 'transparent', transition: '.15s',
          }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '14px' }}>
        {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) => {
          if (k === '') return <div key={i} />;
          return (
            <button key={k} onClick={() => handlePinKey(k)} style={{
              background: k === 'del' ? 'transparent' : '#f0f4f8', border: 'none', borderRadius: '12px', padding: '14px',
              fontSize: k === 'del' ? '.9rem' : '1.1rem', fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif", color: k === 'del' ? '#7b8c9f' : dark, cursor: 'pointer',
            }}>{k === 'del' ? '⌫' : k}</button>
          );
        })}
      </div>
      {loading && <div style={{ textAlign: 'center', color: '#7b8c9f', fontSize: '.85rem' }}>Verifying…</div>}
      <BackBtn to="company" />
    </AuthCard>
  );

  // ── Employee Auth (Login + Join tabs) ─────────────────────────────────────
  if (step === 'employee-auth') return (
    <AuthCard>
      {/* Tab switcher */}
      <div style={{ display: 'flex', background: '#f0f4f8', borderRadius: '12px', padding: '4px', marginBottom: '24px' }}>
        {(['login', 'join'] as AuthTab[]).map(t => (
          <button key={t} onClick={() => { setAuthTab(t); setError(''); }} style={{
            flex: 1, padding: '9px', border: 'none', borderRadius: '9px', cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif", fontSize: '.88rem', fontWeight: 800,
            background: authTab === t ? '#fff' : 'transparent',
            color: authTab === t ? dark : '#7b8c9f',
            boxShadow: authTab === t ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
            transition: '.15s',
          }}>
            {t === 'login' ? '🔑 Sign In' : '✨ Join Now'}
          </button>
        ))}
      </div>

      {authTab === 'login' ? (
        <>
          <p style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: primary, marginBottom: '5px' }}>Returning Employee</p>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 900, color: dark, lineHeight: 1.15, marginBottom: '5px' }}>Sign in</h1>
          <p style={{ fontSize: '.85rem', color: '#7b8c9f', lineHeight: 1.5, marginBottom: '20px' }}>Enter your email, then sign in with your PIN or a magic link.</p>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Work Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && goToEmployeePin()}
              placeholder="you@company.com" autoFocus style={inputStyle} />
          </div>
          <PrimaryBtn onClick={goToEmployeePin} disabled={loading}>
            Sign in with PIN →
          </PrimaryBtn>
          <button onClick={submitMagicLink} disabled={loading}
            style={{ width: '100%', padding: '13px', background: 'transparent', color: dark, border: '2px solid #e0e8f0',
              borderRadius: '14px', fontFamily: "'DM Sans', sans-serif", fontSize: '.88rem', fontWeight: 700, cursor: loading ? 'default' : 'pointer', marginTop: '8px' }}>
            {loading ? 'Sending…' : 'Send Magic Link ✉️ instead'}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: primary, marginBottom: '5px' }}>New Employee</p>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 900, color: dark, lineHeight: 1.15, marginBottom: '5px' }}>Create your account</h1>
          <p style={{ fontSize: '.85rem', color: '#7b8c9f', lineHeight: 1.5, marginBottom: '20px' }}>Join your company's meal portal.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Your Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith"
                autoFocus style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Work Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Company PIN <span style={{ color: '#aab', fontWeight: 400, textTransform: 'none', fontSize: '.7rem' }}>(required if no company email domain)</span></label>
              <input type="password" value={joinPin} onChange={e => setJoinPin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitJoin()}
                placeholder="Ask your manager" style={inputStyle} />
            </div>
          </div>
          <PrimaryBtn onClick={submitJoin} disabled={loading}>
            {loading ? 'Creating account…' : 'Join & Order Meals →'}
          </PrimaryBtn>
        </>
      )}
      <BackBtn to="company" />
    </AuthCard>
  );

  // ── Employee PIN ──────────────────────────────────────────────────────────
  if (step === 'employee-pin') return (
    <AuthCard>
      <p style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: primary, marginBottom: '5px' }}>Sign In</p>
      <h1 style={{ fontSize: '1.45rem', fontWeight: 900, color: dark, lineHeight: 1.15, marginBottom: '6px' }}>Enter your PIN</h1>
      <p style={{ fontSize: '.82rem', color: '#7b8c9f', lineHeight: 1.5, marginBottom: '22px' }}>
        Enter the 4-digit PIN your manager gave you.
      </p>
      {error && (
        <div style={{ background: 'rgba(231,76,60,.07)', border: '1px solid rgba(231,76,60,.2)', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', fontSize: '.82rem', color: red, fontWeight: 600 }}>{error}</div>
      )}
      {/* PIN dots */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '16px' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            width: '14px', height: '14px', borderRadius: '50%',
            border: `2px solid ${pinError ? red : empPin.length > i ? dark : '#d0d8e0'}`,
            background: pinError ? red : empPin.length > i ? dark : 'transparent',
            transition: '.15s',
          }} />
        ))}
      </div>
      {/* PIN grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '14px' }}>
        {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) => {
          if (k === '') return <div key={i} />;
          return (
            <button key={k} onClick={() => handleEmpPinKey(k)} style={{
              background: k === 'del' ? 'transparent' : '#f0f4f8', border: 'none', borderRadius: '12px', padding: '14px',
              fontSize: k === 'del' ? '.9rem' : '1.1rem', fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              color: k === 'del' ? '#7b8c9f' : dark, cursor: 'pointer',
            }}>{k === 'del' ? '\u232B' : k}</button>
          );
        })}
      </div>
      {loading && <div style={{ textAlign: 'center', color: '#7b8c9f', fontSize: '.85rem', marginBottom: '12px' }}>Verifying...</div>}
      <div style={{ textAlign: 'center', marginTop: '8px', marginBottom: '14px' }}>
        <button onClick={submitMagicLink} disabled={loading}
          style={{ fontSize: '.78rem', color: primary, cursor: 'pointer', border: 'none', background: 'transparent', fontWeight: 700 }}>
          Forgot PIN? Sign in with email link →
        </button>
      </div>
      <BackBtn to="employee-auth" />
    </AuthCard>
  );

  // ── Magic Sent ────────────────────────────────────────────────────────────
  if (step === 'magic-sent') return (
    <AuthCard>
      <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
        <div style={{ fontSize: '2.8rem', marginBottom: '12px' }}>✉️</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: dark, marginBottom: '6px' }}>Check your inbox</h2>
        <p style={{ fontSize: '.85rem', color: '#7b8c9f', lineHeight: 1.6, marginBottom: '18px' }}>
          We sent a login link to <strong>{email}</strong>. It expires in 15 minutes.
        </p>
        <p style={{ fontSize: '.78rem', color: '#7b8c9f' }}>
          Didn't get it?{' '}
          <button onClick={() => { setStep('employee-auth'); setError(''); }}
            style={{ fontSize: '.78rem', color: primary, cursor: 'pointer', border: 'none', background: 'transparent', fontWeight: 700 }}>
            Resend link
          </button>
        </p>
      </div>
    </AuthCard>
  );

  return null;
}
