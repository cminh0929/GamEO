import { SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';

export interface BalanceSnapshot {
  userId: string;
  name: string;
  balance: number;
  timestamp: number;
}

export interface BalanceDiff {
  userId: string;
  name: string;
  before: number;
  after: number;
  delta: number;
  expectedDelta?: number;
  pass?: boolean;
}

/**
 * Snapshot current balance for a list of user IDs from Supabase.
 */
export async function snapshotBalances(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Record<string, BalanceSnapshot>> {
  const validIds = userIds.filter(Boolean);
  if (!validIds.length) return {};

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, balance')
    .in('id', validIds);

  if (error) {
    console.error('❌ [BalanceChecker] Lỗi lấy balance:', error.message);
    return {};
  }

  const result: Record<string, BalanceSnapshot> = {};
  for (const row of data || []) {
    result[row.id] = {
      userId: row.id,
      name: row.username ?? row.id.slice(-8),
      balance: row.balance ?? 0,
      timestamp: Date.now(),
    };
  }
  return result;
}

/**
 * Compute delta between two snapshots.
 * expectedDeltas: { [userId]: expectedDelta } — optional for assertion
 */
export function diffBalances(
  before: Record<string, BalanceSnapshot>,
  after: Record<string, BalanceSnapshot>,
  expectedDeltas?: Record<string, number>
): BalanceDiff[] {
  const allIds = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs: BalanceDiff[] = [];

  for (const id of allIds) {
    const b = before[id];
    const a = after[id];
    if (!b || !a) continue;

    const delta = a.balance - b.balance;
    const expectedDelta = expectedDeltas?.[id];
    const pass =
      expectedDelta === undefined
        ? undefined
        : delta === expectedDelta;

    diffs.push({
      userId: id,
      name: b.name ?? a.name,
      before: b.balance,
      after: a.balance,
      delta,
      expectedDelta,
      pass,
    });
  }

  return diffs;
}

/**
 * Print a formatted balance report table to console (and optionally append to log file).
 */
export function printBalanceReport(
  diffs: BalanceDiff[],
  label: string,
  logFile?: string
) {
  const lines: string[] = [];
  lines.push(`\n📊 BALANCE REPORT — ${label}`);
  lines.push('─'.repeat(90));
  lines.push(
    padR('Name', 20) +
      padL('Before', 14) +
      padL('After', 14) +
      padL('Delta', 14) +
      padL('Expected', 14) +
      '  Status'
  );
  lines.push('─'.repeat(90));

  let allPass = true;
  for (const d of diffs) {
    const deltaStr = d.delta >= 0 ? `+${d.delta.toLocaleString()}` : d.delta.toLocaleString();
    const expStr = d.expectedDelta !== undefined
      ? (d.expectedDelta >= 0 ? `+${d.expectedDelta.toLocaleString()}` : d.expectedDelta.toLocaleString())
      : 'N/A';
    const status =
      d.pass === undefined ? '—' : d.pass ? '✅ PASS' : '❌ FAIL';
    if (d.pass === false) allPass = false;

    lines.push(
      padR(d.name, 20) +
        padL(d.before.toLocaleString(), 14) +
        padL(d.after.toLocaleString(), 14) +
        padL(deltaStr, 14) +
        padL(expStr, 14) +
        '  ' + status
    );
  }

  lines.push('─'.repeat(90));
  lines.push(
    `Overall: ${diffs.filter(d => d.pass === true).length} passed, ` +
      `${diffs.filter(d => d.pass === false).length} failed, ` +
      `${diffs.filter(d => d.pass === undefined).length} unasserted`
  );

  // Zero-sum check (players + dealer)
  const totalDelta = diffs.reduce((s, d) => s + d.delta, 0);
  const zeroSumOk = totalDelta === 0;
  lines.push(`Zero-Sum integrity: ${zeroSumOk ? '✅' : '❌'} (net delta = ${totalDelta})`);
  lines.push('');

  const output = lines.join('\n');
  console.log(output);

  if (logFile) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${output}\n`);
  }

  return { allPass, zeroSumOk };
}

/**
 * Assert zero-sum: total delta across all participants must be 0.
 * Returns true if valid.
 */
export function assertZeroSum(diffs: BalanceDiff[]): boolean {
  const total = diffs.reduce((s, d) => s + d.delta, 0);
  if (total !== 0) {
    console.error(`❌ [ZeroSum] Tổng delta không bằng 0! Net = ${total}`);
    return false;
  }
  return true;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function padR(s: string, len: number) {
  return Array.from(s).slice(0, len).join('').padEnd(len);
}
function padL(s: string, len: number) {
  return Array.from(s).slice(0, len).join('').padStart(len);
}
