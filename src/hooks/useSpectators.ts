'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { GameState } from '../types/game';

export interface PresenceUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

/**
 * Tracks everyone currently on the page via Supabase Presence.
 * Returns two lists:
 *  - spectators: users NOT seated as dealer or player
 *  - allPresent: everyone online (including players)
 */
export function useSpectators(roomId: string, me: PresenceUser | null, gameState: GameState) {
  const [allPresent, setAllPresent] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!me) return;

    const channel = supabase.channel(`presence-${roomId}`, {
      config: { presence: { key: me.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>();
        const users: PresenceUser[] = Object.values(state).flatMap((arr) => arr);
        setAllPresent(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ id: me.id, name: me.name, avatarUrl: me.avatarUrl });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [roomId, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive spectators: present but not dealer or player
  const seatedIds = new Set([
    gameState.dealer.id,
    ...gameState.players.map((p) => p.id),
  ].filter(Boolean));

  const spectators = allPresent.filter((u) => !seatedIds.has(u.id));

  return { spectators, allPresent };
}
