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
    try {
      const { data: currentProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single();

      if (fetchError || !currentProfile) throw new Error('Profile not found');

      const newBalance = (currentProfile.balance || 0) + amount;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);

      if (!updateError) {
        await supabase
          .from('transaction_logs')
          .insert({ user_id: userId, amount, type, description });
      }
    } catch (err) {
      console.error('Transaction Error:', err);
    }
  }

  static async fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data;
  }
}
