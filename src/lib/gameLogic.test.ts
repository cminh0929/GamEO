import { describe, it, expect } from 'vitest';
import { calculateScore, checkSpecialHands } from './gameLogic';
import { CardType, Player } from '../types/game';

describe('Game Logic Tests', () => {
  
  describe('calculateScore', () => {
    it('should calculate simple hand correctly', () => {
      const hand: CardType[] = [
        { rank: '10', suit: 'hearts', isRevealed: true },
        { rank: '7', suit: 'clubs', isRevealed: true }
      ];
      expect(calculateScore(hand)).toBe(17);
    });

    it('should handle Ace as 11 when total <= 21', () => {
      const hand: CardType[] = [
        { rank: 'A', suit: 'hearts', isRevealed: true },
        { rank: '9', suit: 'clubs', isRevealed: true }
      ];
      expect(calculateScore(hand)).toBe(20);
    });

    it('should handle Ace as 1 when 11 would bust', () => {
      const hand: CardType[] = [
        { rank: 'A', suit: 'hearts', isRevealed: true },
        { rank: '9', suit: 'clubs', isRevealed: true },
        { rank: '5', suit: 'spades', isRevealed: true }
      ];
      expect(calculateScore(hand)).toBe(15);
    });

    it('should handle multiple Aces correctly (maximize value)', () => {
      const hand: CardType[] = [
        { rank: 'A', suit: 'hearts', isRevealed: true },
        { rank: 'A', suit: 'clubs', isRevealed: true },
        { rank: '9', suit: 'spades', isRevealed: true }
      ];
      // A(11) + A(1) + 9 = 21
      expect(calculateScore(hand)).toBe(21);
    });
  });

  describe('checkSpecialHands', () => {
    it('should detect Xi Bang (AA)', () => {
      const player = {
        hand: [
          { rank: 'A', suit: 'hearts', isRevealed: true },
          { rank: 'A', suit: 'clubs', isRevealed: true }
        ],
        status: 'playing'
      } as Player;
      expect(checkSpecialHands(player)).toBe('xi_bang');
    });

    it('should detect Xi Dach (A + 10/J/Q/K)', () => {
      const player = {
        hand: [
          { rank: 'A', suit: 'hearts', isRevealed: true },
          { rank: 'K', suit: 'clubs', isRevealed: true }
        ],
        status: 'playing'
      } as Player;
      expect(checkSpecialHands(player)).toBe('xi_dach');
    });

    it('should detect Ngu Linh (5 cards <= 21)', () => {
      const player = {
        hand: [
          { rank: '2', suit: 'hearts', isRevealed: true },
          { rank: '3', suit: 'clubs', isRevealed: true },
          { rank: '4', suit: 'spades', isRevealed: true },
          { rank: '5', suit: 'diamonds', isRevealed: true },
          { rank: '2', suit: 'hearts', isRevealed: true }
        ],
        status: 'playing'
      } as Player;
      expect(checkSpecialHands(player)).toBe('ngu_linh');
    });

    it('should detect Bust (score > 21)', () => {
      const player = {
        hand: [
          { rank: '10', suit: 'hearts', isRevealed: true },
          { rank: 'J', suit: 'clubs', isRevealed: true },
          { rank: '5', suit: 'spades', isRevealed: true }
        ],
        status: 'playing'
      } as Player;
      expect(checkSpecialHands(player)).toBe('bust');
    });
  });

});
