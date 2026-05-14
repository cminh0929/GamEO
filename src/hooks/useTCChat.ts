'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface TCChatMessage {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  created_at: string;
}

export function useTCChat(myUserId: string | null) {
  const [messages, setMessages] = useState<TCChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load lịch sử 60 tin gần nhất
  useEffect(() => {
    supabase
      .from('tc_chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (data) setMessages(data.reverse());
        setLoading(false);
      });
  }, []);

  // Realtime: lắng nghe tin mới INSERT
  useEffect(() => {
    const channel = supabase
      .channel('tc-chat-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tc_chat_messages' },
        (payload) => {
          setMessages((prev) => {
            // Tránh duplicate (tin của chính mình đã được add optimistically)
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev.slice(-99), payload.new as TCChatMessage];
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Scroll to bottom khi có tin mới
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMessage = useCallback(async (
    content: string,
    meta: { username: string; avatar_url?: string | null },
  ) => {
    if (!myUserId || !content.trim()) return;
    const optimistic: TCChatMessage = {
      id: `opt-${Date.now()}`,
      user_id: myUserId,
      username: meta.username,
      avatar_url: meta.avatar_url ?? null,
      content: content.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev.slice(-99), optimistic]);

    const { data } = await supabase
      .from('tc_chat_messages')
      .insert({
        user_id: myUserId,
        username: meta.username,
        avatar_url: meta.avatar_url ?? null,
        content: content.trim(),
      })
      .select()
      .single();

    // Thay optimistic bằng record thật
    if (data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? data : m)),
      );
    }
  }, [myUserId]);

  return { messages, loading, sendMessage, bottomRef };
}
