import type { CardType, Rank, Player } from '../../types/game';

type SpecialHand = 'xi_bang' | 'xi_dach' | 'ngu_linh' | 'bust';

export class Hand {
  static getCardValue(rank: Rank): number {
    if (['J', 'Q', 'K'].includes(rank)) return 10;
    if (rank === 'A') return 11;
    return parseInt(rank, 10);
  }

  /**
   * Tính điểm tay bài theo luật Xì Dách Việt Nam:
   * - 4–5 lá: Át = 1
   * - 2–3 lá: Át linh hoạt (11 hoặc 1/10)
   */
  static calculateScore(hand: CardType[]): number {
    let score = 0;
    let aceCount = 0;

    for (const card of hand) {
      if (card.rank === 'A') {
        aceCount++;
        continue;
      }
      score += Hand.getCardValue(card.rank);
    }

    if (hand.length >= 4) {
      return score + aceCount;
    }

    score += aceCount;
    for (let i = 0; i < aceCount; i++) {
      if (score + 10 <= 21) {
        score += 10;
      } else if (hand.length === 3 && score + 9 <= 21) {
        score += 9;
      }
    }

    return score;
  }

  static checkSpecialHands(player: Player): SpecialHand | Player['status'] {
    const { hand } = player;
    const score = Hand.calculateScore(hand);

    if (hand.length === 2) {
      const ranks = hand.map((c) => c.rank);
      if (ranks[0] === 'A' && ranks[1] === 'A') return 'xi_bang';
      if (ranks.includes('A') && ranks.some((r) => ['10', 'J', 'Q', 'K'].includes(r)))
        return 'xi_dach';
    }

    if (hand.length === 5 && score <= 21) return 'ngu_linh';
    if (score > 21) return 'bust';

    return player.status;
  }
}
