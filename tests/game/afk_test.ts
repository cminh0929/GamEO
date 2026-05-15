import './utils/load-env';
import { createClient } from '@supabase/supabase-js';
import { GameRoomService } from '../../src/lib/services/GameRoomService';
import { GameState } from '../../src/types/game';
import { XiDachEngine } from '../../src/lib/game/XiDachEngine';
import { CLIFormatter } from './utils/formatter';
import { Profile } from '../../src/types/platform';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const ROOM_ID = 'gameo-table-1';
const LOG_FILE = path.join(__dirname, 'logs', 'afk_test.log');

function logToFile(msg: string) {
  const timestamp = new Date().toISOString();
  const formattedMsg = `[${timestamp}] ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(LOG_FILE, formattedMsg);
}

const DEALER: Profile = { 
  id: '00000000-0000-4000-a000-000000000000', 
  username: 'Bot Dealer 👑', 
  balance: 10000000, 
  avatar_url: null 
};

const PLAYERS: Profile[] = Array.from({ length: 7 }, (_, i) => ({
  id: `00000000-0000-4000-a000-${(i + 1).toString().padStart(12, '0')}`,
  username: `Bot Player ${i + 1}`,
  balance: 1000000,
  avatar_url: null
}));

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAFKTest() {
  logToFile('🚀 BẮT ĐẦU TEST AFK...');
  
  logToFile('🧹 Đang làm sạch bàn...');
  let state: GameState = {
    deck: [] as any,
    dealer: { id: '', name: 'Nhà Cái', hand: [] as any, score: 0, status: 'playing' as const, balance: 0, currentBet: 0 },
    players: Array.from({ length: 7 }, (_, i) => ({
      id: '', name: `Vị trí ${i + 1}`, hand: [] as any, score: 0, status: 'playing' as const,
      isChecked: false, gameResult: null as any, balance: 0, currentBet: 0,
    })),
    status: 'ended' as any,
    turnIndex: 0,
    lastActionAt: Date.now(),
  };
  await GameRoomService.updateGameState(ROOM_ID, state);
  await delay(1000);

  logToFile('👥 Bots đang vào bàn...');
  let engine = new XiDachEngine(state);
  
  const { data: dData } = await supabase.from('profiles').select('*').eq('id', DEALER.id).single();
  state = engine.takeRole('dealer', dData || DEALER);

  for (let i = 0; i < 7; i++) {
    const { data: pData } = await supabase.from('profiles').select('*').eq('id', PLAYERS[i].id).single();
    state = engine.takeRole('player', pData || PLAYERS[i], i);
  }
  await GameRoomService.updateGameState(ROOM_ID, state);

  logToFile('🃏 Chia bài...');
  engine = new XiDachEngine(state);
  state = engine.startNewGame(); // Betting
  for (let i = 0; i < 7; i++) {
    state = engine.placeBet(i, 10000);
  }
  state = engine.startNewGame(); // Playing
  await GameRoomService.updateGameState(ROOM_ID, state);
  
  const activeIdx = state.turnIndex;
  const afkPlayer = state.players[activeIdx];
  logToFile(`⚠️ ĐẾN LƯỢT ${afkPlayer.name}. BOT SẼ AFK TRONG 40 GIÂY...`);
  logToFile(`⏰ Turn Deadline: ${new Date(state.turnDeadline).toLocaleTimeString()}`);

  // Chờ 40 giây (turnDeadline là 30s)
  for (let i = 1; i <= 4; i++) {
    await delay(10000);
    logToFile(`... Đã chờ ${i * 10} giây ...`);
  }

  logToFile('🔍 Kiểm tra trạng thái bàn sau AFK...');
  state = await GameRoomService.fetchGameState(ROOM_ID) as GameState;
  
  if (state.turnIndex !== activeIdx) {
    logToFile(`✅ THÀNH CÔNG: Lượt đã chuyển từ ${activeIdx} sang ${state.turnIndex}. AFK Logic đã hoạt động.`);
    const prevPlayer = state.players[activeIdx];
    if (prevPlayer.status === 'stay') {
      logToFile(`📝 Kết quả: Player đã được hệ thống cho Auto-Stand.`);
    } else if (prevPlayer.id === '') {
      logToFile(`📝 Kết quả: Player đã bị hệ thống Kick (nếu Offline).`);
    }
  } else {
    logToFile(`❌ THẤT BẠI: Lượt vẫn đang ở ${activeIdx}. AFK Logic KHÔNG hoạt động.`);
    logToFile('💡 Gợi ý: Hãy đảm bảo bạn đang mở trình duyệt ở bàn chơi này để xử lý AFK.');
  }

  logToFile('🏁 KẾT THÚC TEST AFK.');
}

runAFKTest().catch(console.error);
