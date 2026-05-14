'use client';

import { AuthProvider } from '../contexts/AuthContext';
import { PlatformShell } from '../components/platform/PlatformShell';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PlatformShell />
      <div className="app-content">
        {children}
      </div>
    </AuthProvider>
  );
}
