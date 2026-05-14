import { supabase } from '../supabase';
import type { GameState } from '../../types/game';
import type { RealtimeChannel } from '@supabase/supabase-js';

export class GameRoomService {
  static async fetchGameState(roomId: string): Promise<GameState | null> {
    const { data } = await supabase
      .from('game_rooms')
      .select('game_state')
      .eq('id', roomId)
      .maybeSingle();
    return data?.game_state || null;
  }

  static async updateGameState(roomId: string, gameState: GameState): Promise<void> {
    await supabase
      .from('game_rooms')
      .update({ game_state: gameState })
      .eq('id', roomId);
  }

  static subscribeToRoom(
    roomId: string,
    onUpdate: (gameState: GameState) => void
  ): RealtimeChannel {
    const channel = supabase
      .channel(`room-${roomId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` },
        (payload) => onUpdate((payload.new as { game_state: GameState }).game_state)
      )
      .subscribe();
    return channel;
  }
}
