import type { CardType, Rank, Suit } from '../../types/game';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export class Deck {
  static create(): CardType[] {
    const deck: CardType[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank, isRevealed: true });
      }
    }
    return deck;
  }

  static shuffle(deck: CardType[]): CardType[] {
    const newDeck = [...deck];
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
  }

  static createShuffled(): CardType[] {
    return Deck.shuffle(Deck.create());
  }
}
