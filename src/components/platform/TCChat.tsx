'use client';

import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTCChat } from '../../hooks/useTCChat';

export function TCChat() {
  const { session, profile } = useAuth();
  const myId = session?.user.id ?? null;
  const { messages, loading, sendMessage, bottomRef } = useTCChat(myId);
  const [input, setInput] = useState('');

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

  return (
    <section className="tcchat-section">
      <h2 className="tcchat-title">💬 TCChat — Nội bộ</h2>

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
    </section>
  );
}
