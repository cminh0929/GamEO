'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTCChat } from '../../hooks/useTCChat';

export function TCChat() {
  const { session, profile } = useAuth();
  const myId = session?.user.id ?? null;
  const { messages, loading, sendMessage, bottomRef } = useTCChat(myId);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // Track unread messages when panel is closed
  const prevLen = useRef(messages.length);
  useEffect(() => {
    if (!open && messages.length > prevLen.current) {
      setUnread(u => u + (messages.length - prevLen.current));
    }
    prevLen.current = messages.length;
  }, [messages.length, open]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setUnread(0);
  }, []);

  // ── Dragging ─────────────────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!panelRef.current) return;
    dragging.current = true;
    const rect = panelRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !panelRef.current) return;
      const x = e.clientX - dragOffset.current.x;
      const y = e.clientY - dragOffset.current.y;
      panelRef.current.style.left = `${x}px`;
      panelRef.current.style.top = `${y}px`;
      panelRef.current.style.right = 'auto';
      panelRef.current.style.bottom = 'auto';
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // ── Helpers ───────────────────────────────────────────
  const handleSend = () => {
    if (!input.trim() || !profile) return;
    sendMessage(input.trim(), { username: profile.username, avatar_url: profile.avatar_url });
    setInput('');
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    return sameDay ? time : `${d.getDate()}/${d.getMonth() + 1} ${time}`;
  };

  // ── Render ────────────────────────────────────────────
  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 8888,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        userSelect: 'none',
      }}
    >
      {/* ── Expanded panel ── */}
      {open && (
        <div className="tcchat-float-panel">
          {/* Header / drag handle */}
          <div
            className="tcchat-float-header"
            onMouseDown={onMouseDown}
          >
            <span>💬 TCChat — Nội bộ</span>
            <button
              className="tcchat-float-close"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="tcchat-box">
            {loading ? (
              <div className="tcchat-loading">Đang tải...</div>
            ) : messages.length === 0 ? (
              <div className="tcchat-empty">Chưa có tin nhắn. Hãy là người đầu tiên! 👋</div>
            ) : (
              messages.map((m) => {
                const isMe = m.user_id === myId;
                return (
                  <div key={m.id} className={`tcchat-msg ${isMe ? 'me' : ''}`}>
                    {!isMe && (
                      m.avatar_url
                        ? <img src={m.avatar_url} alt={m.username} className="tcchat-avatar" />
                        : <div className="tcchat-avatar-ph">{m.username[0]?.toUpperCase()}</div>
                    )}
                    <div className="tcchat-msg-body">
                      {!isMe && <span className="tcchat-sender">{m.username}</span>}
                      <div className="tcchat-bubble">{m.content}</div>
                      <span className="tcchat-time">{fmt(m.created_at)}</span>
                    </div>
                    {isMe && (
                      m.avatar_url
                        ? <img src={m.avatar_url} alt={m.username} className="tcchat-avatar" />
                        : <div className="tcchat-avatar-ph">{m.username[0]?.toUpperCase()}</div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          {profile ? (
            <div className="tcchat-input-row">
              <input
                className="tcchat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Nhắn gì đó..."
                maxLength={200}
              />
              <button className="tcchat-send-btn" onClick={handleSend} disabled={!input.trim()}>
                Gửi ➤
              </button>
            </div>
          ) : (
            <div className="tcchat-login-hint">Đăng nhập để tham gia chat</div>
          )}
        </div>
      )}

      {/* ── FAB toggle button ── */}
      <button
        className="tcchat-fab"
        onClick={open ? () => setOpen(false) : handleOpen}
        title="Mở / Đóng TCChat"
      >
        {open ? '✕' : '💬'}
        {!open && unread > 0 && (
          <span className="tcchat-badge">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
    </div>
  );
}
