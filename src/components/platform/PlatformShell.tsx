'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { AvatarPicker } from '../ui/AvatarPicker';
import { PRESET_AVATARS } from '../../lib/constants';

export function PlatformShell() {
  const { profile, setProfile } = useAuth();
  const pathname = usePathname();
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const isInGame = pathname !== '/';

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
            💰 {profile.balance.toLocaleString()} đ
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
    </>
  );
}
