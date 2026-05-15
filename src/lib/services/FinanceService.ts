import { supabase } from '../supabase';
import type { TransactionLog } from '../../types/platform';

export class FinanceService {
  static async fetchLogs(userId: string): Promise<TransactionLog[]> {
    const { data } = await supabase
      .from('transaction_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);
    return data || [];
  }

  static async executeTransaction(
    userId: string,
    amount: number,
    type: string,
    description: string
  ): Promise<void> {
    if (!userId) return;

    // Atomic RPC: avoids SELECT→UPDATE race condition when concurrent transactions occur
    const { error: rpcError } = await supabase.rpc('update_balance', {
      p_user_id: userId,
      p_amount: amount,
    });

    if (rpcError) {
      // Fallback: RPC not yet deployed — use non-atomic path
      console.warn('update_balance RPC unavailable, falling back:', rpcError.message);
      const { data: currentProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .maybeSingle();

      if (fetchError || !currentProfile) throw new Error('Profile not found for user: ' + userId);

      // Floor at 0: game logic already caps penalty, this is a DB-level safety net
      const newBalance = Math.max(0, (currentProfile.balance || 0) + amount);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);

      if (updateError) throw updateError;
    }

    // Ghi log giao dịch — BẮt buộc: không được để tiền di chuyển mà không có dấu vết
    const { error: logError } = await supabase
      .from('transaction_logs')
      .insert({ user_id: userId, amount, type, description });

    if (logError) {
      // Retry 1 lần trước khi từ bỏ
      console.warn('Transaction log failed, retrying...', logError.message);
      const { error: retryError } = await supabase
        .from('transaction_logs')
        .insert({ user_id: userId, amount, type, description: `[RETRY] ${description}` });

      if (retryError) {
        // Ghi marker lỗi để admin biết có giao dịch thiếu log
        console.error('Transaction log PERMANENTLY failed — money moved without trace!', retryError.message);
        await supabase.from('transaction_logs').insert({
          user_id: userId, amount, type: 'log_error',
          description: `[LOG_FAILED] ${description} | err: ${retryError.message}`,
        }).then(); // fire-and-forget, mức đích chỉ là alert admin
        throw new Error(`Critical: transaction executed but log failed for user ${userId}: ${retryError.message}`);
      }
    }
  }

  static async fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    return data;
  }

  // --- ADMIN METHODS ---

  static async adminFetchProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('balance', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async adminFetchUserFlow(userId: string): Promise<TransactionLog[]> {
    const { data, error } = await supabase
      .from('transaction_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async adminExecuteTransaction(
    userId: string,
    amount: number,
    description: string
  ): Promise<void> {
    // Admin transactions are always 'admin_adjustment' type
    await this.executeTransaction(userId, amount, 'admin_adjustment', description);
  }

  static detectAnomalies(logs: TransactionLog[]) {
    const threshold = 50_000_000; // Cảnh báo nếu > 50 triệu
    return logs.filter(log => Math.abs(log.amount) >= threshold);
  }
}
