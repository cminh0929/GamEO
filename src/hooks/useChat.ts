'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  text: string;
  avatarUrl?: string;
  timestamp: number;
}

export function useChat(
  roomId: string,
  me: { id: string; name: string; avatarUrl?: string } | null,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // userId -> bubble text (auto-cleared after 4s)
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const showBubble = useCallback((msg: ChatMessage) => {
    setBubbles((prev) => ({ ...prev, [msg.userId]: msg.text }));
    setTimeout(() => {
      setBubbles((prev) => {
        const next = { ...prev };
        delete next[msg.userId];
        return next;
      });
    }, 4000);
  }, []);

  useEffect(() => {
    if (!me) return;

    const channel = supabase.channel(`chat-${roomId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'chat' }, ({ payload }: { payload: ChatMessage }) => {
        setMessages((prev) => [...prev.slice(-99), payload]);
        showBubble(payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, me?.id, showBubble]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(async (text: string) => {
    if (!me || !text.trim() || !channelRef.current) return;
    const msg: ChatMessage = {
      id: `${me.id}-${Date.now()}`,
      userId: me.id,
      name: me.name,
      avatarUrl: me.avatarUrl,
      text: text.trim(),
      timestamp: Date.now(),
    };
    // Add to local list immediately (sender doesn't receive own broadcast)
    setMessages((prev) => [...prev.slice(-99), msg]);
    showBubble(msg);
    await channelRef.current.send({ type: 'broadcast', event: 'chat', payload: msg });
  }, [me, showBubble]);

  return { messages, sendMessage, bubbles };
}
