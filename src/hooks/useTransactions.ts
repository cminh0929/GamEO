'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { FinanceService } from '../lib/services/FinanceService';
import type { TransactionLog } from '../types/platform';

export function useTransactions(userId: string | undefined) {
  const [logs, setLogs] = useState<TransactionLog[]>([]);

  const refreshLogs = useCallback(async () => {
    if (!userId) return;
    const data = await FinanceService.fetchLogs(userId);
    setLogs(data);
  }, [userId]);

  const executeTransaction = useCallback(async (
    targetUserId: string,
    amount: number,
    type: string,
    description: string
  ) => {
    await FinanceService.executeTransaction(targetUserId, amount, type, description);
    // Refresh log only when the transaction is for the current user
    if (targetUserId === userId) {
      await refreshLogs();
    }
  }, [userId, refreshLogs]);

  // Load logs on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshLogs();
  }, [refreshLogs]);

  // Realtime subscription: tự động refresh khi có giao dịch mới được ghi vào DB
  // Kể cả khi dealer thực hiện giao dịch từ browser khác (player sẽ thấy ngay)
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`tx-realtime-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transaction_logs',
          filter: `user_id=eq.${userId}`,
        },
        () => { refreshLogs(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refreshLogs]);

  return { logs, executeTransaction, refreshLogs };
}
