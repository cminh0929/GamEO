import './utils/load-env';
import { createClient } from '@supabase/supabase-js';
import { GameRoomService } from '../../src/lib/services/GameRoomService';
import { GameState } from '../../src/types/game';
import { XiDachEngine } from '../../src/lib/game/XiDachEngine';
import { CLIFormatter } from './utils/formatter';
import { Profile } from '../../src/types/platform';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const ROOM_ID = 'gameo-table-1';

// Real Bot IDs from Database
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

async function botExecuteTransaction(userId: string, amount: number, type: string, description: string) {
  if (amount === 0) return;
  console.log(`💸 [TX] ${userId}: ${amount > 0 ? '+' : ''}${amount.toLocaleString()} (${description})`);
  
  // Gọi hàm rpc update_balance_v2 (giống hệt như web app)
  const { error } = await supabase.rpc('update_balance', {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description

  });

  if (error) console.error(`❌ Lỗi giao dịch cho ${userId}:`, error.message);
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAutoGame() {
  console.log('\n🚀 ĐANG KHỞI CHẠY TEST TỰ ĐỘNG VỚI 7 BOTS...');
  
  console.log('🧹 Đang làm sạch bàn...');
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

  console.log('👥 7 Bots đang vào bàn...');
  let engine = new XiDachEngine(state);
  
  // Nạp số dư thực từ DB cho Dealer
  const { data: dData } = await supabase.from('profiles').select('*').eq('id', DEALER.id).single();
  state = engine.takeRole('dealer', dData || DEALER);

  // Nạp số dư thực từ DB cho 7 Players
  for (let i = 0; i < 7; i++) {
    const { data: pData } = await supabase.from('profiles').select('*').eq('id', PLAYERS[i].id).single();
    state = engine.takeRole('player', pData || PLAYERS[i], i);
  }
  await GameRoomService.updateGameState(ROOM_ID, state);
  CLIFormatter.render(state, 'bot-dealer');
  await delay(1000);

  console.log('🃏 Bắt đầu đặt cược cho 7 bots và chia bài...');
  engine = new XiDachEngine(state);
  state = engine.startNewGame(); // Chuyển sang betting
  // Đặt cược ngẫu nhiên cho 7 bots
  for (let i = 0; i < 7; i++) {
    const randomBet = (Math.floor(Math.random() * 5) + 1) * 10000; // 10k - 50k
    state = engine.placeBet(i, randomBet);
  }
  state = engine.startNewGame(); // Chia bài
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
  let totalDealerDelta = 0;
  
  for (let i = 0; i < updatedPlayers.length; i++) {
    const player = updatedPlayers[i];
    if (player.id !== '' && !player.isChecked) {
      const totalTableBets = state.players.reduce((acc, p) => acc + (p.currentBet || 0), 0);
      const settlement = XiDachEngine.calculatePlayerSettlement(player, state.dealer, totalTableBets);
      
      // Thực hiện giao dịch thật cho Player
      await botExecuteTransaction(player.id, settlement.amount, settlement.type, settlement.description);
      totalDealerDelta -= settlement.amount;

      updatedPlayers[i] = { 
        ...player, 
        isChecked: true, 
        gameResult: settlement.result,
        balance: Math.max(0, player.balance + settlement.amount) 
      };
      console.log(`✅ Xét ${player.name}: ${settlement.result.toUpperCase()} (${settlement.amount > 0 ? '+' : ''}${settlement.amount})`);
    }
  }

  // Thực hiện giao dịch thật cho Dealer
  if (totalDealerDelta !== 0 && state.dealer.id) {
    const dType = totalDealerDelta > 0 ? 'win' : 'lose';
    await botExecuteTransaction(state.dealer.id, totalDealerDelta, dType, `Kết quả ván bài từ bàn chơi`);
  }

  state = { 
    ...state, 
    players: updatedPlayers, 
    dealer: { ...state.dealer, balance: state.dealer.balance + totalDealerDelta },
    status: 'ended' 
  };
  await GameRoomService.updateGameState(ROOM_ID, state);
  CLIFormatter.render(state, '00000000-0000-4000-a000-000000000000');
  
  console.log('\n🏁 VÁN BÀI KẾT THÚC!');
}

async function start() {
  try {
    console.log(`\n--- VÁN THỨ 1 ---`);
    await runAutoGame();
    console.log('\n✅ ĐÃ HOÀN THÀNH TEST TỰ ĐỘNG 1 VÁN.');
    process.exit(0);
  } catch (err) {
    console.error('Lỗi trong quá trình chạy test:', err);
    process.exit(1);
  }
}

start();
