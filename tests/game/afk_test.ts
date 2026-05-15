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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);
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

async function processSettlement(userId: string, amount: number, type: string, description: string) {
  const { error } = await supabase.rpc('update_balance', {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description
  });
  if (error) logToFile(`❌ Lỗi cập nhật tiền cho ${userId}: ${error.message}`);
  else logToFile(`✅ Đã cập nhật ${amount > 0 ? '+' : ''}${amount} cho ${userId} (${type})`);
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
    turnDeadline: 0,
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
    await processSettlement(PLAYERS[i].id, -10000, 'bet', `Bet for room ${ROOM_ID}`);
  }
  state = engine.startNewGame(); // Playing
  await GameRoomService.updateGameState(ROOM_ID, state);

  const activeIdx = state.turnIndex;
  if (activeIdx === -1) {
    logToFile('⚠️ Ván bài đã kết thúc ngay lập tức (có thể do Xì Bàng/Xì Dách). Không thể test AFK.');
    logToFile('🏁 KẾT THÚC TEST AFK.');
    return;
  }

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
    logToFile(`✅ THÀNH CÔNG: Lượt đã chuyển từ ${activeIdx} sang ${state.turnIndex}.`);
    
    logToFile('⚖️ Đang thực hiện quyết toán THẬT vào Database...');
    const totalTableBets = state.players.reduce((acc, p) => acc + (p.currentBet || 0), 0);
    let totalDealerDelta = 0;

    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (p.id && !p.isChecked) {
        const settlement = XiDachEngine.calculatePlayerSettlement(p, state.dealer, totalTableBets);
        await processSettlement(p.id, settlement.amount, settlement.type, `Settlement for room ${ROOM_ID} (AFK Test)`);
        totalDealerDelta -= settlement.amount;
      }
    }
    
    if (DEALER.id && totalDealerDelta !== 0) {
      await processSettlement(DEALER.id, totalDealerDelta, totalDealerDelta > 0 ? 'win' : 'lose', `Total dealer settlement for room ${ROOM_ID}`);
    }
    logToFile('✅ Quyết toán hoàn tất.');
  } else {
    logToFile(`❌ THẤT BẠI: Lượt vẫn đang ở ${activeIdx}. AFK Logic KHÔNG hoạt động.`);
  }

  logToFile('🏁 KẾT THÚC TEST AFK.');
}

runAFKTest().catch(console.error);
