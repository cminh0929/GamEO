'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { AvatarPicker } from '../ui/AvatarPicker';
import { AdminPanel } from './AdminPanel';
import { TCChat } from './TCChat';
import { PRESET_AVATARS } from '../../lib/constants';

export function PlatformShell() {
  const { profile, setProfile, isAdmin, bypassOrientation, setBypassOrientation } = useAuth();
  const pathname = usePathname();
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const isInGame = pathname !== '/';

  // Ctrl + / to toggle admin panel (only for admin)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        if (isAdmin) setShowAdmin(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isAdmin]);

  return (
    <>
      <header className="platform-header">
        {/* Left: Logo / Back to Lobby */}
        <div className="platform-left">
          <Link href="/" className="platform-logo">
            👑 <span>GAMEO</span>
          </Link>
          {isInGame && (
            <Link href="/" className="btn-back-lobby">
              ← Sảnh
            </Link>
          )}
        </div>

        {/* Center: Balance */}
        {profile && (
          <div className="platform-balance">
            💰 {(profile.balance ?? 0).toLocaleString()} đ
          </div>
        )}

        {/* Right: User info */}
        {profile && (
          <div className="platform-user">
            <button
              className="platform-avatar-btn"
              onClick={() => setShowAvatarPicker(true)}
              title="Đổi avatar"
            >
              <img
                src={profile.avatar_url || PRESET_AVATARS[0]}
                alt="Avatar"
                className="platform-avatar-img"
              />
            </button>
            <span className="platform-username">{profile.username}</span>
            <button
              className="btn-platform-logout"
              onClick={() => supabase.auth.signOut()}
            >
              Đăng xuất
            </button>
          </div>
        )}
      </header>

      {showAvatarPicker && profile && (
        <AvatarPicker
          userId={profile.id}
          currentAvatar={profile.avatar_url ?? undefined}
          onClose={() => setShowAvatarPicker(false)}
          onUpdate={(url: string) => {
            setProfile({ ...profile, avatar_url: url });
            setShowAvatarPicker(false);
          }}
        />
      )}

      {showAdmin && isAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      {/* Orientation Guard for Mobile */}
      {!bypassOrientation && (
        <div className="orientation-guard">
          <div className="og-icon">🔄</div>
          <h2 className="og-title">Xoay ngang màn hình</h2>
          <p className="og-desc">
            Vui lòng xoay ngang điện thoại để có trải nghiệm chơi bài tốt nhất tại GAMEO.
          </p>
          <button
            onClick={() => setBypassOrientation(true)}
            style={{
              marginTop: '1.2rem',
              padding: '10px 20px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '20px',
              color: '#d4af37',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Tiếp tục chơi dọc (Dạng danh sách) 📱
          </button>
        </div>
      )}

      <TCChat />
    </>
  );
}
