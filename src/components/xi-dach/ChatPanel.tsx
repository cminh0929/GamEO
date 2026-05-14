'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../../hooks/useChat';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  myId: string | null;
}

export function ChatPanel({ messages, onSend, myId }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const prevLen = useRef(messages.length);

  // Track unread when panel is closed
  useEffect(() => {
    if (!open && messages.length > prevLen.current) {
      setUnread((u) => u + (messages.length - prevLen.current));
    }
    prevLen.current = messages.length;
  }, [messages.length, open]);

  // Clear unread + scroll to bottom on open
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  }, [open]);

  // Auto-scroll when new messages arrive while open
  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, open]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  const fmt = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className={`chat-drawer ${open ? 'open' : ''}`}>
      {/* Toggle tab */}
      <button
        className="chat-toggle"
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Đóng chat' : 'Mở chat'}
      >
        {open ? '›' : '‹'}
        {!open && unread > 0 && (
          <span className="chat-unread">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {/* Panel */}
      <div className="chat-content">
        <div className="chat-header">💬 Chat bàn</div>

        <ul className="chat-list" ref={listRef}>
          {messages.length === 0 && (
            <li className="chat-empty">Chưa có tin nhắn nào</li>
          )}
          {messages.map((m) => {
            const isMe = m.userId === myId;
            return (
              <li key={m.id} className={`chat-msg ${isMe ? 'me' : ''}`}>
                {!isMe && (
                  m.avatarUrl
                    ? <img src={m.avatarUrl} className="chat-avatar" alt={m.name} />
                    : <div className="chat-avatar-ph">{m.name[0]}</div>
                )}
                <div className="chat-bubble-wrap">
                  {!isMe && <span className="chat-sender">{m.name}</span>}
                  <div className="chat-bubble">{m.text}</div>
                  <span className="chat-time">{fmt(m.timestamp)}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="chat-input-row">
          <input
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Nhắn tin..."
            maxLength={120}
          />
          <button className="chat-send" onClick={handleSend}>➤</button>
        </div>
      </div>
    </div>
  );
}
