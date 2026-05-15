import { GameState, CardType } from '../../../src/types/game';

export class CLIFormatter {
  private static colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    bgGreen: '\x1b[42m',
    bgRed: '\x1b[41m',
  };

  static formatCard(card: CardType): string {
    const symbols: Record<string, string> = {
      'spades': '♠️',
      'hearts': '♥️',
      'diamonds': '♦️',
      'clubs': '♣️'
    };
    const color = (card.suit === 'hearts' || card.suit === 'diamonds') ? this.colors.red : '';
    return `${color}${card.rank}${symbols[card.suit]}${this.colors.reset}`;
  }

  static formatHand(hand: CardType[]): string {
    if (hand.length === 0) return this.colors.dim + '(Trống)' + this.colors.reset;
    return hand.map(c => this.formatCard(c)).join(' ');
  }

  static render(state: GameState, currentUserId?: string) {
    console.clear();
    console.log(`\n${this.colors.bright}${this.colors.cyan}=== GAMEO XÌ DÁCH CLI TESTER ===${this.colors.reset}`);
    console.log(`${this.colors.dim}Phòng: gameo-table-1 | Trạng thái: ${this.colors.yellow}${state.status.toUpperCase()}${this.colors.reset}\n`);

    // --- Dealer ---
    const isDealerMe = state.dealer.id === currentUserId;
    const dealerLabel = isDealerMe ? `${this.colors.bgGreen} BẠN (NHÀ CÁI) ${this.colors.reset}` : `${this.colors.magenta}NHÀ CÁI${this.colors.reset}`;
    console.log(`${dealerLabel} ${this.colors.bright}${state.dealer.name}${this.colors.reset}`);
    console.log(`Bài: ${this.formatHand(state.dealer.hand)} | Điểm: ${this.colors.yellow}${state.dealer.score}${this.colors.reset}`);
    console.log(`Tiền: ${this.colors.green}$${(state.dealer.balance ?? 0).toLocaleString()}${this.colors.reset}`);
    console.log('-'.repeat(40));

    // --- Players ---
    state.players.forEach((p, i) => {
      if (p.id === '') {
        console.log(`${this.colors.dim}[Vị trí ${i}] Đang trống${this.colors.reset}`);
        return;
      }

      const isMe = p.id === currentUserId;
      const isTurn = state.turnIndex === i && state.status === 'playing';
      const indicator = isTurn ? '➡️ ' : '   ';
      const meLabel = isMe ? `${this.colors.bgGreen} BẠN ${this.colors.reset} ` : '';
      
      let statusColor = '';
      if (p.gameResult === 'win') statusColor = this.colors.green;
      if (p.gameResult === 'lose') statusColor = this.colors.red;
      if (p.status === 'bust') statusColor = this.colors.red;

      console.log(`${indicator}${this.colors.bright}${i}: ${p.name}${this.colors.reset} ${meLabel}`);
      console.log(`   Bài: ${this.formatHand(p.hand)} | Điểm: ${statusColor}${p.score}${this.colors.reset} | Cược: ${this.colors.yellow}$${(p.currentBet ?? 0).toLocaleString()}${this.colors.reset}`);
      if (p.gameResult) console.log(`   Kết quả: ${statusColor}${p.gameResult.toUpperCase()}${this.colors.reset}`);
      if (p.isChecked) console.log(`   ${this.colors.dim}(Đã xét)${this.colors.reset}`);
    });

    console.log('\n' + '='.repeat(40));
    console.log(`${this.colors.bright}LỆNH:${this.colors.reset} sit [n] | dealer | start | bet [n] | hit | stand | check [n] | reset | exit`);
  }
}
