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

  private addLog(message: string) {
    if (!this.state.actionLogs) this.state.actionLogs = [];
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.state.actionLogs.push(`[${time}] ${message}`);
    if (this.state.actionLogs.length > 50) this.state.actionLogs.shift();
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
    if (profile.balance < 10000) throw new Error('Bạn cần ít nhất 10,000 xu để vào bàn!');

    this.updateLastAction();

    if (type === 'dealer') {
      gs.dealer = {
        ...gs.dealer,
        id: profile.id, name: `${profile.username} 👑`,
        balance: profile.balance, avatarUrl: profile.avatar_url ?? undefined,
      };
      this.addLog(`${profile.username} đã làm Nhà Cái 👑`);
    } else if (index !== undefined) {
      gs.players[index] = {
        ...gs.players[index],
        id: profile.id, name: profile.username,
        balance: profile.balance, avatarUrl: profile.avatar_url ?? undefined,
      };
      this.addLog(`${profile.username} đã ngồi vào vị trí ${index + 1} 🪑`);
    }
    return this.state;
  }

  kickPlayer(index: number | 'dealer'): GameState {
    this.updateLastAction();

    if (index === 'dealer') {
      const oldName = this.state.dealer.name || 'Nhà Cái';
      this.state.dealer = { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 };
      this.addLog(`${oldName} đã rời bàn 👋`);
    } else {
      const oldName = this.state.players[index].name || `Vị trí ${index + 1}`;
      this.state.players[index] = {
        id: '', name: `Vị trí ${index + 1}`, hand: [], score: 0, status: 'playing',
        isChecked: false, gameResult: null, balance: 0, currentBet: 0,
      };
      this.addLog(`${oldName} đã rời ghế hoặc bị kick 👋`);
    }
    return this.state;
  }

  placeBet(index: number, amount: number): GameState {
    this.updateLastAction();
    this.state.players[index].currentBet = amount;
    this.addLog(`${this.state.players[index].name} đã cược $${amount.toLocaleString()} 💵`);
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
      this.state.processedTransactions = [];
      this.addLog('Vòng đặt cược mới bắt đầu! Vui lòng đặt cược 🪙');
      return this.state;
    }

    const newDeck = Deck.createShuffled();
    const dealerHand = [newDeck.pop()!, newDeck.pop()!];
    const dealerProfile: Player = { ...gs.dealer, hand: dealerHand as CardType[], score: Hand.calculateScore(dealerHand as CardType[]) };
    const dealerSpecial = Hand.checkSpecialHands(dealerProfile);

    const updatedPlayers = gs.players.map((p) => {
      if (p.id === '') return p;
      const hand = [newDeck.pop()!, newDeck.pop()!];
      const pWithHand: Player = { ...p, hand: hand as CardType[], score: Hand.calculateScore(hand as CardType[]) };
      const pSpecial = Hand.checkSpecialHands(pWithHand);
      
      // Nếu người chơi có Xì Bàng/Xì Dách, họ "Stay" luôn
      if (pSpecial === 'xi_bang' || pSpecial === 'xi_dach') {
        return { ...pWithHand, status: 'stay' as const };
      }
      return { ...pWithHand, status: 'playing' as const };
    });

    this.state.deck = newDeck;
    this.state.dealer = dealerProfile;
    this.state.players = updatedPlayers;
    
    this.addLog('Nhà Cái đã chia bài! Bắt đầu ván chơi 🃏');
    
    // Log special hands immediately after dealing
    updatedPlayers.forEach((p) => {
      if (p.id === '') return;
      const pSpecial = Hand.checkSpecialHands(p);
      if (pSpecial === 'xi_bang' || pSpecial === 'xi_dach') {
        const specialName = pSpecial === 'xi_bang' ? 'XÌ BÀNG 🌟' : 'XÌ DÁCH ✨';
        this.addLog(`${p.name} đạt ${specialName} ngay khi chia bài!`);
      }
    });

    if (dealerSpecial === 'xi_bang' || dealerSpecial === 'xi_dach') {
      const specialName = dealerSpecial === 'xi_bang' ? 'XÌ BÀNG 👑' : 'XÌ DÁCH ✨';
      this.addLog(`Nhà Cái đạt ${specialName} ngay khi chia bài!`);
      this.state.status = 'ended';
      this.state.turnIndex = -1;
    } else {
      this.state.status = 'playing';
      const firstPlayerIndex = updatedPlayers.findIndex((p) => p.id !== '' && p.status === 'playing');
      this.state.turnIndex = firstPlayerIndex !== -1 ? firstPlayerIndex : -1;
    }
    this.state.turnDeadline = Date.now() + 30000;
    this.state.roundId = `round-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.state.processedTransactions = [];
    this.updateLastAction();
    
    return this.state;
  }

  hit(idx: number): GameState {
    const player = this.state.players[idx];
    const newDeck = [...this.state.deck];
    const newCard = newDeck.pop()!;
    const newHand = [...player.hand, newCard];
    const newScore = Hand.calculateScore(newHand);
    const isBust = newScore > 21;
    const isMaxCards = newHand.length === 5;

    this.updateLastAction();
    this.state.deck = newDeck;
    const suitSymbol = newCard.suit === 'hearts' ? '♥️' : newCard.suit === 'diamonds' ? '♦️' : newCard.suit === 'clubs' ? '♣️' : '♠️';
    this.addLog(`${player.name} rút lá ${newCard.rank}${suitSymbol} (${newScore}đ) 🃏`);

    // Logic Phân loại bài
    if (newScore >= 28) {
      // ĐỀN: Tự động qua lượt
      this.state.players[idx] = { ...player, hand: newHand, score: newScore, status: 'den' };
      this.getNextTurnState();
    } else if (newScore > 21) {
      // QUẮC: Cho phép rút tiếp đến 5 lá, chỉ qua lượt nếu đủ 5 lá
      this.state.players[idx] = { ...player, hand: newHand, score: newScore, status: 'bust' };
      if (isMaxCards) {
        this.getNextTurnState();
      }
    } else {
      // Đủ điểm hoặc Ngũ Linh: Chỉ qua lượt nếu đủ 5 lá
      this.state.players[idx] = { ...player, hand: newHand, score: newScore, status: 'playing' };
      if (isMaxCards) {
        this.getNextTurnState();
      }
    }
    return this.state;
  }

  stand(idx: number): GameState {
    const player = this.state.players[idx];
    if (player.score < 16 && player.hand.length < 5) {
      throw new Error('Bạn chưa đủ 16 điểm để Dằn bài!');
    }
    
    this.updateLastAction();
    if (player.status !== 'bust') {
      player.status = 'stay';
    }
    this.addLog(`${player.name} dằn bài (${player.score}đ) ✋`);
    return this.getNextTurnState();
  }

  dealerHit(): GameState {
    const newDeck = [...this.state.deck];
    const newCard = newDeck.pop()!;
    const newHand = [...this.state.dealer.hand, newCard];
    
    this.updateLastAction();
    this.state.deck = newDeck;
    const newScore = Hand.calculateScore(newHand);
    const suitSymbol = newCard.suit === 'hearts' ? '♥️' : newCard.suit === 'diamonds' ? '♦️' : newCard.suit === 'clubs' ? '♣️' : '♠️';
    this.state.dealer = {
      ...this.state.dealer,
      hand: newHand,
      score: newScore
    };
    this.addLog(`Nhà Cái rút thêm lá ${newCard.rank}${suitSymbol} (${newScore}đ) 🃏`);
    return this.state;
  }

  canDealerCheck(dealer: Player): { allowed: boolean; reason?: string } {
    const score = Hand.calculateScore(dealer.hand);
    const special = Hand.checkSpecialHands(dealer);
    const isSpecial = special === 'xi_bang' || special === 'xi_dach';
    
    if (!isSpecial && score < 15 && dealer.hand.length < 5) {
      return { allowed: false, reason: 'Nhà Cái phải đủ ít nhất 15 điểm hoặc 5 lá bài mới được quyền XÉT!' };
    }
    return { allowed: true };
  }

  static calculatePlayerSettlement(player: Player, dealer: Player, totalTableBets: number) {
    const bet = player.currentBet;
    let amount = 0;
    let type: 'win' | 'lose' | 'draw' = 'draw';
    let description = '';
    let result: 'win' | 'lose' | 'draw' = 'draw';

    if (player.status === 'den') {
      amount = -totalTableBets;
      type = 'lose';
      description = `Đền bài (>= 28đ) - Phạt tổng cược bàn`;
      result = 'lose';
    } else {
      const res = this.calculateResult(player, dealer);
      result = res.result;
      if (res.result === 'win') {
        amount = bet * res.multiplier;
        type = 'win';
        description = `Thắng ván bài (${res.specialHand || player.score + 'đ'}) x${res.multiplier}`;
      } else if (res.result === 'lose') {
        amount = -bet * res.multiplier;
        type = 'lose';
        description = `Thua ván bài (${res.specialHand || player.score + 'đ'}) x${res.multiplier}`;
      } else {
        description = `Hòa ván bài (${player.score + 'đ'})`;
      }
    }

    return { amount, type, description, result };
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
    } else if (dealerSpecial === 'xi_bang') {
      result = 'lose'; multiplier = 4; specialHand = 'Nhà Cái Xì Bàng';
    } else if (playerSpecial === 'xi_dach') {
      if (dealerSpecial === 'xi_dach') result = 'draw';
      else { result = 'win'; multiplier = 3; specialHand = 'Xì Dách'; }
    } else if (dealerSpecial === 'xi_dach') {
      result = 'lose'; multiplier = 3; specialHand = 'Nhà Cái Xì Dách';
    } else if (playerSpecial === 'ngu_linh') {
      if (dealerSpecial === 'ngu_linh') result = 'draw';
      else { result = 'win'; multiplier = 2; specialHand = 'Ngũ Linh'; }
    } else if (dealerSpecial === 'ngu_linh') {
      result = 'lose'; multiplier = 2; specialHand = 'Nhà Cái Ngũ Linh';
    } else if (player.score < 16 && !playerSpecial) {
      // Chưa đủ tuổi: Thua luôn (trừ khi có bộ bài đặc biệt)
      result = 'lose';
    } else if (player.score > 21) {
      if (dealerScore > 21) result = 'draw';
      else result = 'lose';
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
