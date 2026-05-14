'use client';

import React, { useState } from 'react';
import type { PresenceUser } from '../../hooks/useSpectators';

interface SpectatorPanelProps {
  spectators: PresenceUser[];
  allPresent: PresenceUser[];
}

export function SpectatorPanel({ spectators, allPresent }: SpectatorPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`spectator-drawer ${open ? 'open' : ''}`}>
      {/* Toggle tab */}
      <button
        className="spectator-toggle"
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Đóng danh sách' : 'Xem người quan sát'}
      >
        {open ? '›' : '‹'}
        {!open && spectators.length > 0 && (
          <span className="spectator-count">{spectators.length}</span>
        )}
      </button>

      {/* Panel content */}
      <div className="spectator-content">
        <div className="spectator-header">
          <span>👁 Đang quan sát</span>
          <span className="spectator-total">{allPresent.length} online</span>
        </div>

        {spectators.length === 0 ? (
          <p className="spectator-empty">Chưa có ai đang xem</p>
        ) : (
          <ul className="spectator-list">
            {spectators.map((u) => (
              <li key={u.id} className="spectator-item">
                {u.avatarUrl
                  ? <img src={u.avatarUrl} alt={u.name} className="spectator-avatar" />
                  : <div className="spectator-avatar-placeholder">{u.name[0]}</div>
                }
                <span className="spectator-name">{u.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
