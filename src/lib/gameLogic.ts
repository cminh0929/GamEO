import { CardType, Rank, Suit, Player } from '../types/game';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const createDeck = (): CardType[] => {
  const deck: CardType[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, isRevealed: true });
    }
  }
  return deck;
};

export const shuffle = (deck: CardType[]): CardType[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export const getCardValue = (rank: Rank): number => {
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank);
};

export const calculateScore = (hand: CardType[]): number => {
  let score = 0;
  let aceCount = 0;

  for (const card of hand) {
    if (card.rank === 'A') {
      aceCount++;
      continue;
    }
    score += getCardValue(card.rank);
  }

  // Logic tính Át (A) linh hoạt theo số lá bài
  if (aceCount > 0) {
    if (hand.length === 2) {
      // 2 lá: A tính 11 (hoặc 10 nếu có 2 con A)
      if (aceCount === 1) score += 11;
      else score += 11 + 1; // 1 con 11, 1 con 1 (tổng 12 - Xì Bàng)
    } else if (hand.length === 3) {
      // 3 lá: A tính 10
      score += aceCount * 10;
    } else {
      // 4-5 lá: A tính 1
      score += aceCount * 1;
    }
  }

  // Tối ưu hóa lần cuối nếu vẫn quắc (cho trường hợp 3 lá A=10 bị quá 21)
  while (score > 21 && aceCount > 0 && hand.length === 3) {
    score -= 9; // Chuyển từ 10 về 1
    aceCount--;
  }

  return score;
};

export const checkSpecialHands = (player: Player) => {
  const { hand } = player;
  const score = calculateScore(hand);

  if (hand.length === 2) {
    const ranks = hand.map(c => c.rank);
    if (ranks[0] === 'A' && ranks[1] === 'A') return 'xi_bang';
    if (ranks.includes('A') && ranks.some(r => ['10', 'J', 'Q', 'K'].includes(r))) return 'xi_dach';
  }

  if (hand.length === 5 && score <= 21) return 'ngu_linh';
  if (score > 21) return 'bust';
  
  return player.status;
};
