import { createClient } from '@supabase/supabase-js';

// KHÔNG hardcode key ở đây để tránh lộ thông tin trên GitHub
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);
const ROOM_ID = 'gameo-table-1';

async function resetDatabase() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Thiếu biến môi trường NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return;
  }

  console.log('🔄 Đang tiến hành reset database...');
  
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
    .upsert({ id: ROOM_ID, game_state: emptyState });

  if (error) {
    console.error('❌ Lỗi:', error.message);
  } else {
    console.log('✅ Đã reset Game Room thành công!');
  }
}

resetDatabase();
