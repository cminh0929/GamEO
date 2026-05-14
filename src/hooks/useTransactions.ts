'use client';

import { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshLogs();
  }, [refreshLogs]);

  return { logs, executeTransaction, refreshLogs };
}
