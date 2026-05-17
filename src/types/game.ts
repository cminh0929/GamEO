export type GameType = 'xi_dach' | 'tai_xiu' | 'mau_binh';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface CardType {
  suit: Suit;
  rank: Rank;
  isRevealed: boolean;
}

export type GameStatus = 'betting' | 'playing' | 'dealer_turn' | 'ended';

export interface Player {
  id: string;
  name: string;
  hand: CardType[];
  score: number;
  status: 'playing' | 'stay' | 'bust' | 'xi_dach' | 'xi_bang' | 'ngu_linh' | 'den';
  isChecked?: boolean;
  gameResult?: 'win' | 'lose' | 'draw' | null;
  balance: number;
  currentBet: number;
  avatarUrl?: string;
}

export interface GameState {
  deck: CardType[];
  dealer: Player;
  players: Player[];
  status: GameStatus;
  turnIndex: number; // Index of current player
  turnDeadline: number; // Timestamp khi hết lượt
  lastActionAt: number; // Mốc thời gian hành động cuối cùng
  processedTransactions?: string[]; // Lưu vết ID các giao dịch đã thực hiện để tránh lặp
  roundId?: string; // ID duy nhất của ván bài để chống trùng giao dịch
  actionLogs?: string[]; // Ghi nhận lịch sử diễn biến ván bài
}
