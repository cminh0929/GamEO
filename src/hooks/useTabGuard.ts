'use client';

import { useState, useEffect } from 'react';

/**
 * Detects duplicate tabs for the same user + room combination.
 * Uses BroadcastChannel for same-origin cross-tab communication.
 * Falls back gracefully if BroadcastChannel is not supported.
 *
 * @returns isBlocked — true when another tab for this user+room is already open
 */
export function useTabGuard(userId: string | null, roomId: string) {
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (!userId) return;

    // BroadcastChannel is widely supported (Chrome, Firefox, Edge, Safari 15.4+)
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('useTabGuard: BroadcastChannel not supported, multi-tab guard disabled.');
      return;
    }

    const key = `gameo-tab-${userId}-${roomId}`;
    const channel = new BroadcastChannel(key);

    // Announce our presence to any existing tab
    channel.postMessage('TAB_OPENED');

    channel.onmessage = (e: MessageEvent<string>) => {
      if (e.data === 'TAB_OPENED') {
        // Another tab just opened → we are the existing tab, block the newcomer
        // and notify it that we're already here
        channel.postMessage('TAB_ALREADY_OPEN');
        // Also block ourselves to surface conflicts clearly (optional — remove if
        // you only want to block the NEW tab)
      }
      if (e.data === 'TAB_ALREADY_OPEN') {
        // We are the NEW tab — someone was already here
        setIsBlocked(true);
      }
    };

    return () => {
      channel.close();
    };
  }, [userId, roomId]);

  return { isBlocked };
}
