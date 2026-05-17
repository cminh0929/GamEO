import { SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';

export interface TransactionRecord {
  id?: string;
  user_id: string;
  amount: number;
  type: string;
  description: string;
  created_at?: string;
}

export interface TxValidationResult {
  userId: string;
  txType: string;
  amount: number;
  expectedAmount?: number;
  pass: boolean;
  reason?: string;
}

/**
 * Fetch recent transactions for given user IDs since a timestamp.
 * Tries the `transaction_logs` table first; falls back gracefully.
 */
export async function fetchRecentTransactions(
  supabase: SupabaseClient,
  userIds: string[],
  since: Date
): Promise<{ data: TransactionRecord[]; degraded: boolean }> {
  const { data, error } = await supabase
    .from('transaction_logs')
    .select('*')
    .in('user_id', userIds)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    // Table may not exist yet — log warning and return empty with degraded flag
    if (error.code === 'PGRST116' || error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
      console.warn('⚠️  [TxChecker] transaction_logs table không tìm thấy — bỏ qua kiểm tra TX log (Degraded Mode).');
      return { data: [], degraded: true };
    }
    console.error('❌ [TxChecker] Lỗi fetch transaction_logs:', error.message);
    return { data: [], degraded: false };
  }

  return { data: (data ?? []) as TransactionRecord[], degraded: false };
}

/**
 * Validate that transactions match expected settlements.
 * expectedSettlements: [{ userId, expectedAmount, txType }]
 */
export function validateTransactions(
  txs: TransactionRecord[],
  expectedSettlements: Array<{ userId: string; expectedAmount: number; txType: string }>
): TxValidationResult[] {
  const results: TxValidationResult[] = [];

  for (const exp of expectedSettlements) {
    const matching = txs.filter(
      (t) => t.user_id === exp.userId && t.type === exp.txType
    );

    if (matching.length === 0) {
      results.push({
        userId: exp.userId,
        txType: exp.txType,
        amount: 0,
        expectedAmount: exp.expectedAmount,
        pass: false,
        reason: 'Không tìm thấy transaction',
      });
      continue;
    }

    const totalAmount = matching.reduce((s, t) => s + t.amount, 0);
    const pass = totalAmount === exp.expectedAmount;
    results.push({
      userId: exp.userId,
      txType: exp.txType,
      amount: totalAmount,
      expectedAmount: exp.expectedAmount,
      pass,
      reason: pass ? undefined : `Actual=${totalAmount}, Expected=${exp.expectedAmount}`,
    });
  }

  return results;
}

/**
 * Check for duplicate transactions (same user + same round description).
 */
export function checkDuplicateTx(txs: TransactionRecord[]): boolean {
  const seen = new Set<string>();
  let hasDuplicate = false;

  for (const tx of txs) {
    const key = `${tx.user_id}|${tx.description}`;
    if (seen.has(key)) {
      console.error(`❌ [TxChecker] Duplicate TX: user=${tx.user_id} desc="${tx.description}"`);
      hasDuplicate = true;
    }
    seen.add(key);
  }

  return !hasDuplicate;
}

/**
 * Print a transaction log summary to console + optional log file.
 */
export function printTxReport(
  txs: TransactionRecord[],
  validations: TxValidationResult[],
  label: string,
  logFile?: string,
  degraded: boolean = false
) {
  const lines: string[] = [];
  const statusSuffix = degraded ? ' [DEGRADED MODE - TABLE MISSING]' : '';
  lines.push(`\n🧾 TRANSACTION LOG — ${label} (${txs.length} entries)${statusSuffix}`);
  lines.push('─'.repeat(80));

  for (const tx of txs) {
    const sign = tx.amount >= 0 ? '+' : '';
    lines.push(
      `  [${tx.type.toUpperCase().padEnd(8)}] ${tx.user_id.slice(-12)}  ${sign}${tx.amount.toLocaleString().padStart(10)}  ${tx.description}`
    );
  }

  if (validations.length > 0) {
    lines.push('\n  Validation Results:');
    for (const v of validations) {
      const status = v.pass ? '✅' : '❌';
      lines.push(
        `  ${status} ${v.userId.slice(-12)} [${v.txType}] actual=${v.amount} expected=${v.expectedAmount}` +
          (v.reason ? ` — ${v.reason}` : '')
      );
    }
  }

  lines.push('─'.repeat(80));

  const output = lines.join('\n');
  console.log(output);

  if (logFile) {
    const ts = new Date().toISOString();
    fs.appendFileSync(logFile, `[${ts}] ${output}\n`);
  }
}
