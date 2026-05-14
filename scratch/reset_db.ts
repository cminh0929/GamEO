import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // Hoặc Service Role nếu cần
const supabase = createClient(supabaseUrl, supabaseKey);

const ROOM_ID = 'gameo-table-1';

async function resetDatabase() {
  const emptyState = {
    deck: [],
    dealer: { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 },
    players: Array.from({ length: 10 }, (_, i) => ({
      id: '', name: `Vị trí ${i + 1}`, hand: [], score: 0, status: 'playing', isChecked: false, gameResult: null, balance: 0, currentBet: 0,
    })),
    status: 'ended',
    turnIndex: 0,
    lastActionAt: Date.now(),
  };

  const { error } = await supabase
    .from('game_rooms')
    .update({ game_state: emptyState })
    .eq('id', ROOM_ID);

  if (error) {
    console.error('Lỗi khi reset database:', error);
  } else {
    console.log('✅ Đã reset Game Room thành công!');
  }
}

resetDatabase();
