'use client';

import { useState, useEffect } from 'react';
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

  // Turn countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (gameState.status === 'playing' && gameState.turnDeadline) {
        const diff = Math.max(0, Math.floor((gameState.turnDeadline - now) / 1000));
        setTimeLeft(diff);
        const myPlayerIndex = gameState.players.findIndex((p) => p.id === profile?.id);
        // Guard: don't auto-stand if this tab is blocked (duplicate tab scenario)
        if (diff === 0 && gameState.turnIndex === myPlayerIndex && !isBlocked) {
          stand(gameState.turnIndex);
        }
      } else {
        setTimeLeft(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.status, gameState.turnDeadline, gameState.turnIndex, gameState.players, profile?.id, stand, isBlocked]);

  // Idle timer (auto-reset if dealer is away)
  useEffect(() => {
    if (gameState.dealer.id === '') {
      setIdleTimeLeft(120);
      return;
    }
    const timer = setInterval(() => {
      const now = Date.now();
      // Use 120s threshold and a small grace period for clock drift
      const diff = Math.floor((now - (gameState.lastActionAt || now)) / 1000);
      const remaining = 120 - diff;
      
      // If diff is negative (dealer clock is in the future), remaining will be > 120, which is safe.
      // If diff is slightly positive due to clock drift, it won't hit 0 immediately.
      setIdleTimeLeft(remaining <= 0 ? 0 : remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState.dealer.id, gameState.lastActionAt]);

  return { timeLeft, idleTimeLeft };
}
