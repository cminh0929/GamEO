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
  status: 'playing' | 'stay' | 'bust' | 'xi_dach' | 'xi_bang' | 'ngu_linh';
  isChecked?: boolean;
  gameResult?: 'win' | 'lose' | 'draw' | null;
  balance: number;
  currentBet: number;
  isSpinning?: boolean;
}

export interface GameState {
  deck: CardType[];
  dealer: Player;
  players: Player[];
  status: GameStatus;
  turnIndex: number; // Index of current player
  turnDeadline?: number; // Timestamp khi hết lượt
}
