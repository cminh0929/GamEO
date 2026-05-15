import { GameState, CardType, Player, GameStatus } from '../../types/game';
import { Hand } from './Hand';
import { Deck } from './Deck';
import { Profile } from '../../types/platform';

export class XiDachEngine {
  private state: GameState;

  constructor(state: GameState) {
    // Clone state to ensure immutability
    this.state = JSON.parse(JSON.stringify(state));
  }

  getState(): GameState {
    return this.state;
  }

  private updateLastAction() {
    this.state.lastActionAt = Date.now();
  }

  getNextTurnState(): GameState {
    let nextIdx = this.state.turnIndex + 1;
    while (nextIdx < this.state.players.length && this.state.players[nextIdx].id === '') nextIdx++;
    
    if (nextIdx >= this.state.players.length) {
      this.state.turnIndex = -1;
      this.state.turnDeadline = 0;
    } else {
      this.state.turnIndex = nextIdx;
      this.state.turnDeadline = Date.now() + 30000;
    }
    return this.state;
  }

  takeRole(type: 'dealer' | 'player', profile: Profile, index?: number): GameState {
    const gs = this.state;
    const alreadySeated =
      gs.players.some((p) => p.id === profile.id) ||
      gs.dealer.id === profile.id;
    
    if (alreadySeated) throw new Error('Bạn đã có vị trí rồi!');

    this.updateLastAction();

    if (type === 'dealer') {
      gs.dealer = {
        ...gs.dealer,
        id: profile.id, name: `${profile.username} 👑`,
        balance: profile.balance, avatarUrl: profile.avatar_url ?? undefined,
      };
    } else if (index !== undefined) {
      gs.players[index] = {
        ...gs.players[index],
        id: profile.id, name: profile.username,
        balance: profile.balance, avatarUrl: profile.avatar_url ?? undefined,
      };
    }
    return this.state;
  }

  kickPlayer(index: number | 'dealer'): GameState {
    this.updateLastAction();

    if (index === 'dealer') {
      this.state.dealer = { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 };
    } else {
      this.state.players[index] = {
        id: '', name: `Vị trí ${index + 1}`, hand: [], score: 0, status: 'playing',
        isChecked: false, gameResult: null, balance: 0, currentBet: 0,
      };
    }
    return this.state;
  }

  placeBet(index: number, amount: number): GameState {
    this.updateLastAction();
    this.state.players[index].currentBet = amount;
    return this.state;
  }

  startNewGame(): GameState {
    const gs = this.state;
    
    if (gs.status !== 'betting') {
      this.updateLastAction();
      this.state.status = 'betting' as GameStatus;
      this.state.dealer = { ...gs.dealer, hand: [], score: 0, status: 'playing' as const };
      this.state.players = gs.players.map((p) => ({
        ...p, currentBet: 0, gameResult: null, isChecked: false, hand: [], status: 'playing' as const,
      }));
      return this.state;
    }

    const newDeck = Deck.createShuffled();
    const dealerHand = [newDeck.pop()!, newDeck.pop()!];
    const updatedPlayers = gs.players.map((p) => {
      if (p.id === '') return p;
      const hand = [newDeck.pop()!, newDeck.pop()!];
      return { ...p, hand: hand as CardType[], score: Hand.calculateScore(hand as CardType[]), status: 'playing' as const, isChecked: false };
    });

    const firstPlayerIndex = updatedPlayers.findIndex((p) => p.id !== '');
    
    this.state.deck = newDeck;
    this.state.dealer = { ...gs.dealer, hand: dealerHand as CardType[], score: Hand.calculateScore(dealerHand as CardType[]), status: 'playing' };
    this.state.players = updatedPlayers;
    this.state.status = 'playing';
    this.state.turnIndex = firstPlayerIndex !== -1 ? firstPlayerIndex : 0;
    this.state.turnDeadline = Date.now() + 30000;
    this.updateLastAction();
    
    return this.state;
  }

  hit(idx: number): GameState {
    const player = this.state.players[idx];
    const newDeck = [...this.state.deck];
    const newCard = newDeck.pop()!;
    const newHand = [...player.hand, newCard];
    const newScore = Hand.calculateScore(newHand);
    const isBust = newScore >= 28;
    const isMaxCards = newHand.length === 5;

    this.updateLastAction();
    this.state.deck = newDeck;

    if (isBust) {
      this.state.players[idx] = { ...player, hand: newHand, score: newScore, status: 'bust' };
    } else {
      this.state.players[idx] = { ...player, hand: newHand, score: newScore, status: isMaxCards ? 'stay' : 'playing' };
      if (isMaxCards) {
        this.getNextTurnState();
      }
    }
    return this.state;
  }

  stand(idx: number): GameState {
    this.updateLastAction();
    if (this.state.players[idx].status !== 'bust') {
      this.state.players[idx].status = 'stay';
    }
    return this.getNextTurnState();
  }

  dealerHit(): GameState {
    const newDeck = [...this.state.deck];
    const newCard = newDeck.pop()!;
    const newHand = [...this.state.dealer.hand, newCard];
    
    this.updateLastAction();
    this.state.deck = newDeck;
    this.state.dealer = {
      ...this.state.dealer,
      hand: newHand,
      score: Hand.calculateScore(newHand)
    };
    return this.state;
  }

  static calculateResult(player: Player, dealer: Player): { result: 'win' | 'lose' | 'draw', multiplier: number, specialHand: string | null } {
    const playerSpecial = Hand.checkSpecialHands(player);
    const dealerSpecial = Hand.checkSpecialHands(dealer);
    const dealerScore = Hand.calculateScore(dealer.hand);

    let result: 'win' | 'lose' | 'draw' = 'draw';
    let multiplier = 1;
    let specialHand: string | null = null;

    if (playerSpecial === 'xi_bang') {
      if (dealerSpecial === 'xi_bang') result = 'draw';
      else { result = 'win'; multiplier = 4; specialHand = 'Xì Bàng'; }
    } else if (playerSpecial === 'xi_dach') {
      if (dealerSpecial === 'xi_bang') result = 'lose';
      else if (dealerSpecial === 'xi_dach') result = 'draw';
      else { result = 'win'; multiplier = 3; specialHand = 'Xì Dách'; }
    } else if (dealerSpecial === 'xi_bang' || dealerSpecial === 'xi_dach') {
      result = 'lose';
    } else if (player.score > 21) {
      result = 'lose';
    } else if (playerSpecial === 'ngu_linh') {
      if (dealerSpecial === 'ngu_linh') result = 'draw';
      else { result = 'win'; multiplier = 2; specialHand = 'Ngũ Linh'; }
    } else if (dealerScore > 21) {
      result = 'win';
    } else if (dealerScore > player.score) {
      result = 'lose';
    } else if (dealerScore < player.score) {
      result = 'win';
    }

    return { result, multiplier, specialHand };
  }
}
