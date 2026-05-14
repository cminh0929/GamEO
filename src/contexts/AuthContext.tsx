'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FinanceService } from '../lib/services/FinanceService';
import { Auth } from '../components/ui/Auth';
import type { Profile } from '../types/platform';
import type { Session } from '@supabase/supabase-js';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const data = await FinanceService.fetchProfile(userId);
    if (!data) { setLoading(false); return; }

    if (data.balance === 0) {
      // Gift starter balance
      await FinanceService.executeTransaction(userId, 10_000_000, 'gift', 'Tặng vốn khởi nghiệp');
    } else {
      setProfile(data);
    }
    setLoading(false);
  }

  // Auth state listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        loadProfile(s.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
   
  }, []);

  // Real-time profile sync (balance, avatar)
  useEffect(() => {
    if (!session?.user.id) return;
    const channel = supabase
      .channel(`profile-${session.user.id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${session.user.id}`,
      }, (payload) => {
        setProfile(payload.new as Profile);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user.id]);


  if (loading) {
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

  if (!session) {
    return <Auth onSession={setSession} />;
  }

  return (
    <AuthContext.Provider value={{ session, profile, setProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
