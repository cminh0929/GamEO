'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';

/**
 * AuthGuard — wraps any game route to ensure the user is authenticated.
 *
 * Note: AuthProvider already redirects to the Auth UI when `session` is null,
 * so this guard primarily handles the case where a child component renders
 * before the AuthContext has fully resolved (the `loading` window).
 *
 * Usage:
 *   <AuthGuard>
 *     <YourGamePage />
 *   </AuthGuard>
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If both resolved to null, the AuthProvider will already show the Auth UI.
    // This redirect is a belt-and-suspenders safety net for edge cases where
    // AuthGuard is used outside of AuthProvider.
    if (session === null && profile === null) {
      router.replace('/');
    }
  }, [session, profile, router]);

  // Still resolving auth state — show branded loader
  if (session === undefined as unknown) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#050505', color: '#d4af37', fontSize: '1.5rem', fontWeight: 900,
      }}>
        GAMEO CASINO...
      </div>
    );
  }

  // Unauthenticated — AuthProvider handles the UI, render nothing here
  if (!session) return null;

  return <>{children}</>;
}
