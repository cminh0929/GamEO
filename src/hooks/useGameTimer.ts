'use client';

import { useState, useEffect, useRef } from 'react';
import type { GameState } from '../types/game';
import type { Profile } from '../types/platform';

interface UseGameTimerOptions {
  gameState: GameState;
  profile: Profile | null;
  stand: (idx: number) => void;
  /** When true (tab is blocked by TabGuard), suppress all timer-triggered actions */
  isBlocked?: boolean;
}

export function useGameTimer({ gameState, profile, stand, isBlocked = false }: UseGameTimerOptions) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [idleTimeLeft, setIdleTimeLeft] = useState(60);

  // Use ref to avoid stale closures and keep the effect dependency stable
  const standRef = useRef(stand);
  useEffect(() => {
    standRef.current = stand;
  }, [stand]);

  const profileId = profile?.id;
  const myPlayerIndex = gameState.players.findIndex((p) => p.id === profileId);

  // Track the local turn deadline, initialized when the turn changes
  const [localTurnDeadline, setLocalTurnDeadline] = useState<number>(0);
  const prevTurnKey = useRef<string>('');

  // Update local deadline when turn changes
  useEffect(() => {
    if (gameState.status === 'playing' && gameState.turnIndex !== -1) {
      const turnKey = `${gameState.status}-${gameState.turnIndex}-${gameState.roundId || ''}`;
      if (prevTurnKey.current !== turnKey) {
        prevTurnKey.current = turnKey;
        // Turn just changed or game started. Set local deadline to 30 seconds from now
        setLocalTurnDeadline(Date.now() + 30000);
      }
    } else {
      prevTurnKey.current = '';
      setLocalTurnDeadline(0);
      setTimeLeft(0);
    }
  }, [gameState.status, gameState.turnIndex, gameState.roundId]);

  // Turn countdown timer
  useEffect(() => {
    if (!localTurnDeadline || gameState.status !== 'playing') {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((localTurnDeadline - now) / 1000));
      setTimeLeft(diff);

      // Guard: don't auto-stand if this tab is blocked (duplicate tab scenario)
      if (diff <= 0 && gameState.status === 'playing' && gameState.turnIndex === myPlayerIndex && !isBlocked) {
        standRef.current(gameState.turnIndex);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [localTurnDeadline, gameState.status, gameState.turnIndex, myPlayerIndex, isBlocked]);

  // Idle timer (auto-reset if dealer is away)
  useEffect(() => {
    if (gameState.dealer.id === '') {
      setIdleTimeLeft(60);
      return;
    }
    const timer = setInterval(() => {
      const now = Date.now();
      const diff = Math.floor((now - (gameState.lastActionAt || now)) / 1000);
      const remaining = 60 - diff;
      
      setIdleTimeLeft(remaining <= 0 ? 0 : remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState.dealer.id, gameState.lastActionAt]);

  return { timeLeft, idleTimeLeft };
}
