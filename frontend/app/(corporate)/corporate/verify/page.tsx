'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { corpAuth, setCorpToken } from '../../../lib/corp-api';

function VerifyContent() {
  const router  = useRouter();
  const params  = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setMessage('Invalid link — no token provided.');
      setStatus('error');
      return;
    }

    corpAuth.verifyToken(token)
      .then(res => {
        setCorpToken(res.access_token, res.user);
        router.replace('/corporate/work');
      })
      .catch(e => {
        setMessage(e.message ?? 'This link is invalid or has expired.');
        setStatus('error');
      });
  }, [params, router]);

  const dark    = '#00465e';
  const primary = '#4ea2fd';
  const red     = '#e74c3c';

  return (
    <div style={{
      minHeight: '100vh', background: '#faebda',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ textAlign: 'center', maxWidth: '380px', padding: '24px' }}>
        {status === 'loading' ? (
          <>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              border: `3px solid #e8edf2`, borderTopColor: primary,
              animation: 'spin .7s linear infinite', margin: '0 auto 16px',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: dark, marginBottom: '8px' }}>Signing you in…</h2>
            <p style={{ fontSize: '.85rem', color: '#7b8c9f' }}>Verifying your magic link.</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔗</div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: dark, marginBottom: '8px' }}>Link expired</h2>
            <p style={{ fontSize: '.85rem', color: '#7b8c9f', lineHeight: 1.6, marginBottom: '20px' }}>{message}</p>
            <a
              href="/corporate/login"
              style={{
                display: 'inline-block', padding: '13px 28px',
                background: dark, color: '#fff', borderRadius: '14px',
                fontWeight: 800, fontSize: '.95rem', textDecoration: 'none',
              }}
            >Request a new link</a>
          </>
        )}
      </div>
    </div>
  );
}

export default function CorporateVerifyPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Verifying...</div>}>
      <VerifyContent />
    </Suspense>
  );
}
