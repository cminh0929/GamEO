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

  // Tính điểm các lá bài không phải Át trước
  for (const card of hand) {
    if (card.rank === 'A') {
      aceCount++;
      continue;
    }
    score += getCardValue(card.rank);
  }

  // Cộng mỗi con Át ít nhất 1 điểm
  score += aceCount;

  // Với mỗi con Át, thử cộng thêm 10 điểm (để biến nó thành 11)
  // nếu tổng điểm vẫn không vượt quá 21
  for (let i = 0; i < aceCount; i++) {
    if (score + 10 <= 21) {
      score += 10;
    }
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
