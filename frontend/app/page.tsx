'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Check if user has token, redirect accordingly
    const token = localStorage.getItem('access_token');
    if (token) {
      const role = localStorage.getItem('user_role');
      router.replace(role === 'kitchen' ? '/kitchen' : '/dashboard');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-16 h-16 bg-brand-500 rounded-xl mx-auto mb-4 flex items-center justify-center animate-pulse">
          <span className="text-white text-3xl font-bold">C</span>
        </div>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  );
}
