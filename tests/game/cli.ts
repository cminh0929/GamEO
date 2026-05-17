import './utils/load-env';
import * as readline from 'readline';
import { createClient } from '@supabase/supabase-js';
import { GameRoomService } from '../../src/lib/services/GameRoomService';
import { XiDachEngine } from '../../src/lib/game/XiDachEngine';
import { GameState } from '../../src/types/game';
import { CLIFormatter } from './utils/formatter';
import { Profile } from '../../src/types/platform';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Lỗi: Thiếu biến môi trường Supabase trong .env.local');
  process.exit(1);
}

// Dùng service key nếu có để có quyền thao tác trực tiếp không bị RLS chặn
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
const ROOM_ID = 'gameo-table-1';

const MOCK_PROFILE: Profile = {
  id: 'terminal-tester-id',
  username: 'admin',
  balance: 1000000,
  avatar_url: null
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log('Đang kết nối Supabase...');
  let state: GameState | null = await GameRoomService.fetchGameState(ROOM_ID);
  
  if (!state) {
    console.error('Không thể lấy trạng thái bàn chơi!');
    process.exit(1);
  }

  supabase
    .channel(ROOM_ID)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${ROOM_ID}` }, (payload: any) => {
      state = payload.new.game_state;
      CLIFormatter.render(state!, MOCK_PROFILE.id);
    })
    .subscribe();

  CLIFormatter.render(state, MOCK_PROFILE.id);

  const loop = () => {
    rl.question('> ', async (input) => {
      const [cmd, arg] = input.toLowerCase().split(' ');
      
      try {
        const engine = new XiDachEngine(state!);
        let newState: GameState | null = null;

        switch (cmd) {
          case 'sit':
            newState = engine.takeRole('player', MOCK_PROFILE, parseInt(arg));
            break;
          case 'dealer':
            newState = engine.takeRole('dealer', MOCK_PROFILE);
            break;
          case 'start':
            newState = engine.startNewGame();
            break;
          case 'bet':
            newState = engine.placeBet(state!.players.findIndex(p => p.id === MOCK_PROFILE.id), parseInt(arg));
            break;
          case 'hit':
            const myIdx = state!.players.findIndex(p => p.id === MOCK_PROFILE.id);
            if (myIdx !== -1) newState = engine.hit(myIdx);
            else if (state!.dealer.id === MOCK_PROFILE.id) newState = engine.dealerHit();
            break;
          case 'stand':
            const myIdxS = state!.players.findIndex(p => p.id === MOCK_PROFILE.id);
            if (myIdxS !== -1) newState = engine.stand(myIdxS);
            break;
          case 'check':
            const targetIdx = parseInt(arg);
            const { result } = XiDachEngine.calculateResult(state!.players[targetIdx], state!.dealer);
            newState = { ...state! };
            newState.players[targetIdx].isChecked = true;
            newState.players[targetIdx].gameResult = result;
            break;
          case 'kick':
            newState = engine.kickPlayer(arg === 'dealer' ? 'dealer' : parseInt(arg));
            break;
          case 'reset':
            newState = {
              deck: [],
              dealer: { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 },
              players: Array.from({ length: 7 }, (_, i) => ({
                id: '', name: `Vị trí ${i + 1}`, hand: [], score: 0, status: 'playing',
                isChecked: false, gameResult: null, balance: 0, currentBet: 0,
              })),
              status: 'ended',
              turnIndex: 0,
              lastActionAt: Date.now(),
            };
            break;
          case 'status':
            CLIFormatter.render(state!, MOCK_PROFILE.id);
            break;
          case 'exit':
            process.exit(0);
          default:
            console.log('Lệnh không hợp lệ!');
        }

        if (newState) {
          state = newState;
          await GameRoomService.updateGameState(ROOM_ID, newState);
          CLIFormatter.render(newState, MOCK_PROFILE.id);
        }
      } catch (err: any) {
        console.error('Lỗi:', err.message || err);
      }
      loop();
    });
  };

  loop();
}

main();
