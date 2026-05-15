import './utils/load-env';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BOTS = [
  { id: '00000000-0000-4000-a000-000000000000', username: 'Bot Dealer 👑', balance: 10000000 },
  { id: '00000000-0000-4000-a000-000000000001', username: 'Bot Player 1', balance: 1000000 },
  { id: '00000000-0000-4000-a000-000000000002', username: 'Bot Player 2', balance: 1000000 },
  { id: '00000000-0000-4000-a000-000000000003', username: 'Bot Player 3', balance: 1000000 },
  { id: '00000000-0000-4000-a000-000000000004', username: 'Bot Player 4', balance: 1000000 },
  { id: '00000000-0000-4000-a000-000000000005', username: 'Bot Player 5', balance: 1000000 },
  { id: '00000000-0000-4000-a000-000000000006', username: 'Bot Player 6', balance: 1000000 },
  { id: '00000000-0000-4000-a000-000000000007', username: 'Bot Player 7', balance: 1000000 },
];

async function setupBots() {
  console.log('🛠️ Đang khởi tạo tài khoản Bot trong database...');
  
  for (const bot of BOTS) {
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: bot.id,
        username: bot.username,
        balance: bot.balance,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      console.error(`❌ Lỗi khi tạo ${bot.username}:`, error.message);
    } else {
      console.log(`✅ Đã tạo/cập nhật: ${bot.username}`);
    }
  }

  console.log('\n✨ Hoàn tất! Các con Bot hiện đã là người chơi "thật" trong hệ thống.');
  process.exit(0);
}

setupBots();
