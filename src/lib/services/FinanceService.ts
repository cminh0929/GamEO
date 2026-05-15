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

    // Atomic RPC: xử lý cả update balance và insert log trong 1 transaction ở DB
    // SECURITY DEFINER giúp Dealer có quyền update/log cho Player mà không bị RLS chặn
    const { error: rpcError } = await supabase.rpc('update_balance', {
      p_user_id: userId,
      p_amount: amount,
      p_type: type,
      p_description: description,
    });

    if (rpcError) {
      // Fallback: Nếu RPC mới (4 params) chưa được deploy, thử dùng RPC cũ hoặc manual path
      console.warn('Atomic RPC failed, trying fallback path:', rpcError.message);
      
      const { data: currentProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .maybeSingle();

      if (fetchError || !currentProfile) {
        throw new Error(`Giao dịch thất bại: Không tìm thấy profile user ${userId}`);
      }

      const newBalance = Math.max(0, (currentProfile.balance || 0) + amount);
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);

      if (updateError) throw new Error(`Lỗi cập nhật số dư: ${updateError.message}`);

      // Manual log fallback (vẫn có nguy cơ bị RLS chặn nếu Dealer làm cho Player)
      const { error: logError } = await supabase
        .from('transaction_logs')
        .insert({ user_id: userId, amount, type, description });
      
      if (logError) {
        console.error('Manual log failed (likely RLS):', logError.message);
        throw new Error(`Giao dịch thành công nhưng không thể ghi log: ${logError.message}`);
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
