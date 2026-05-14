/**
 * @deprecated Import from lib/game/Deck and lib/game/Hand directly.
 * This file is kept for backward compatibility.
 */
import { Deck } from './game/Deck';
import { Hand } from './game/Hand';
import type { CardType, Player } from '../types/game';

export const createDeck = (): CardType[] => Deck.create();
export const shuffle = (deck: CardType[]): CardType[] => Deck.shuffle(deck);
export const calculateScore = (hand: CardType[]): number => Hand.calculateScore(hand);
export const checkSpecialHands = (player: Player) => Hand.checkSpecialHands(player);

export { Deck, Hand };
