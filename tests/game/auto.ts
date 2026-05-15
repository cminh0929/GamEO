import './utils/load-env';
import { createClient } from '@supabase/supabase-js';
import { GameRoomService } from '../../src/lib/services/GameRoomService';
import { XiDachEngine } from '../../src/lib/game/XiDachEngine';
import { CLIFormatter } from './utils/formatter';
import { Profile } from '../../src/types/platform';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const ROOM_ID = 'gameo-table-1';

// Mocks
const DEALER: Profile = { id: 'bot-dealer', username: 'Bot Dealer', balance: 10000000, avatar_url: null };
const PLAYERS: Profile[] = [
  { id: 'bot-1', username: 'Bot Player 1', balance: 500000, avatar_url: null },
  { id: 'bot-2', username: 'Bot Player 2', balance: 500000, avatar_url: null },
  { id: 'bot-3', username: 'Bot Player 3', balance: 500000, avatar_url: null },
];

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAutoGame() {
  console.log('\n🚀 ĐANG KHỞI CHẠY TEST TỰ ĐỘNG...');
  
  console.log('🧹 Đang làm sạch bàn...');
  let state = {
    deck: [],
    dealer: { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing' as const, balance: 0, currentBet: 0 },
    players: Array.from({ length: 7 }, (_, i) => ({
      id: '', name: `Vị trí ${i + 1}`, hand: [], score: 0, status: 'playing' as const,
      isChecked: false, gameResult: null as any, balance: 0, currentBet: 0,
    })),
    status: 'ended' as any,
    turnIndex: 0,
    lastActionAt: Date.now(),
  };
  await GameRoomService.updateGameState(ROOM_ID, state);
  await delay(1000);

  console.log('👥 Bots đang vào bàn...');
  let engine = new XiDachEngine(state);
  state = engine.takeRole('dealer', DEALER);
  state = engine.takeRole('player', PLAYERS[0], 0);
  state = engine.takeRole('player', PLAYERS[1], 2);
  state = engine.takeRole('player', PLAYERS[2], 5);
  await GameRoomService.updateGameState(ROOM_ID, state);
  CLIFormatter.render(state, 'bot-dealer');
  await delay(1000);

  console.log('🃏 Bắt đầu đặt cược và chia bài...');
  engine = new XiDachEngine(state);
  state = engine.startNewGame();
  state = engine.placeBet(0, 10000);
  state = engine.placeBet(2, 20000);
  state = engine.placeBet(5, 50000);
  state = engine.startNewGame();
  await GameRoomService.updateGameState(ROOM_ID, state);
  CLIFormatter.render(state, 'bot-dealer');
  await delay(2000);

  while (state.status === 'playing' && state.turnIndex !== -1) {
    const activeIdx = state.turnIndex;
    const player = state.players[activeIdx];
    console.log(`\n🤖 Lượt của ${player.name} (Điểm: ${player.score})...`);
    
    engine = new XiDachEngine(state);
    if (player.score < 16) {
      console.log('👉 Rút bài (dưới 16đ)');
      state = engine.hit(activeIdx);
    } else if (player.score < 18 && Math.random() > 0.5) {
      console.log('👉 Rút bài (mạo hiểm)');
      state = engine.hit(activeIdx);
    } else {
      console.log('✋ Dừng bài');
      state = engine.stand(activeIdx);
    }
    
    await GameRoomService.updateGameState(ROOM_ID, state);
    CLIFormatter.render(state, 'bot-dealer');
    await delay(1500);
  }

  console.log('\n👑 Lượt của NHÀ CÁI...');
  while (state.dealer.score < 15 && state.dealer.hand.length < 5) {
    console.log(`👉 Nhà cái rút bài (Điểm hiện tại: ${state.dealer.score})`);
    engine = new XiDachEngine(state);
    state = engine.dealerHit();
    await GameRoomService.updateGameState(ROOM_ID, state);
    CLIFormatter.render(state, 'bot-dealer');
    await delay(2000);
  }
  console.log('✋ Nhà cái dừng rút.');

  console.log('⚖️ Đang xét bài tất cả mọi người...');
  const updatedPlayers = [...state.players];
  for (let i = 0; i < updatedPlayers.length; i++) {
    if (updatedPlayers[i].id !== '' && !updatedPlayers[i].isChecked) {
      const { result } = XiDachEngine.calculateResult(updatedPlayers[i], state.dealer);
      updatedPlayers[i] = { ...updatedPlayers[i], isChecked: true, gameResult: result };
      console.log(`✅ Xét ${updatedPlayers[i].name}: ${result.toUpperCase()}`);
    }
  }
  state = { ...state, players: updatedPlayers, status: 'ended' };
  await GameRoomService.updateGameState(ROOM_ID, state);
  CLIFormatter.render(state, 'bot-dealer');
  
  console.log('\n🏁 VÁN BÀI KẾT THÚC!');
}

async function start() {
  try {
    for (let i = 1; i <= 3; i++) {
      console.log(`\n--- VÁN THỨ ${i} ---`);
      await runAutoGame();
      await delay(3000);
    }
    console.log('\n✅ ĐÃ HOÀN THÀNH TEST TỰ ĐỘNG 3 VÁN.');
    process.exit(0);
  } catch (err) {
    console.error('Lỗi trong quá trình chạy test:', err);
    process.exit(1);
  }
}

start();
