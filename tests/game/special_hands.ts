import { XiDachEngine } from '../../src/lib/game/XiDachEngine';
import { Player, CardType } from '../../src/types/game';

// Mock profiles for testing
const dealerProfile: Player = {
  id: 'dealer-1', name: 'Dealer', balance: 1000000, currentBet: 0,
  hand: [], score: 0, status: 'playing'
};

const botProfile: Player = {
  id: 'bot-1', name: 'Bot 1', balance: 100000, currentBet: 10000,
  hand: [], score: 0, status: 'playing', isChecked: false
};

function runTest() {
  console.log('--- STARTING SPECIAL HANDS VALIDATION ---');

  // Case 1: Bot has Xi Bang (AA) vs Dealer normal (17 pts)
  console.log('\n[TEST 1] Bot Xi Bang vs Dealer 17 pts');
  const botXiBang: Player = {
    ...botProfile,
    hand: [
      { suit: 'spades', rank: 'A', isRevealed: true },
      { suit: 'hearts', rank: 'A', isRevealed: true }
    ]
  };
  const dealer17: Player = {
    ...dealerProfile,
    hand: [
      { suit: 'clubs', rank: '10', isRevealed: true },
      { suit: 'diamonds', rank: '7', isRevealed: true }
    ]
  };
  botXiBang.score = 21; // Mock score for logic
  dealer17.score = 17;

  let settlement = XiDachEngine.calculatePlayerSettlement(botXiBang, dealer17, 10000);
  console.log('Result:', settlement);
  if (settlement.amount === 40000 && settlement.result === 'win') {
    console.log('✅ PASS: Xi Bang multiplier is x4 (10k * 4 = 40k)');
  } else {
    console.error('❌ FAIL: Xi Bang settlement incorrect');
  }

  // Case 2: Bot has Xi Dach (AJ) vs Dealer normal (18 pts)
  console.log('\n[TEST 2] Bot Xi Dach vs Dealer 18 pts');
  const botXiDach: Player = {
    ...botProfile,
    hand: [
      { suit: 'spades', rank: 'A', isRevealed: true },
      { suit: 'hearts', rank: 'J', isRevealed: true }
    ]
  };
  botXiDach.score = 21;
  const dealer18: Player = { ...dealer17, score: 18 };

  settlement = XiDachEngine.calculatePlayerSettlement(botXiDach, dealer18, 10000);
  console.log('Result:', settlement);
  if (settlement.amount === 30000 && settlement.result === 'win') {
    console.log('✅ PASS: Xi Dach multiplier is x3 (10k * 3 = 30k)');
  } else {
    console.error('❌ FAIL: Xi Dach settlement incorrect');
  }

  // Case 3: Bot has Ngu Linh (5 cards, 20 pts) vs Dealer normal (21 pts)
  console.log('\n[TEST 3] Bot Ngu Linh vs Dealer 21 pts');
  const botNguLinh: Player = {
    ...botProfile,
    hand: [
      { suit: 'spades', rank: '2', isRevealed: true },
      { suit: 'hearts', rank: '3', isRevealed: true },
      { suit: 'clubs', rank: '4', isRevealed: true },
      { suit: 'diamonds', rank: '5', isRevealed: true },
      { suit: 'spades', rank: '6', isRevealed: true }
    ]
  };
  botNguLinh.score = 20;
  const dealer21: Player = { ...dealerProfile, score: 21 };

  settlement = XiDachEngine.calculatePlayerSettlement(botNguLinh, dealer21, 10000);
  console.log('Result:', settlement);
  if (settlement.amount === 20000 && settlement.result === 'win') {
    console.log('✅ PASS: Ngu Linh multiplier is x2 (10k * 2 = 20k)');
  } else {
    console.error('❌ FAIL: Ngu Linh settlement incorrect');
  }

  // Case 4: Bot Xi Dach vs Dealer Xi Bang
  console.log('\n[TEST 4] Bot Xi Dach vs Dealer Xi Bang');
  const dealerXiBang: Player = {
    ...dealerProfile,
    hand: [
      { suit: 'spades', rank: 'A', isRevealed: true },
      { suit: 'hearts', rank: 'A', isRevealed: true }
    ]
  };
  dealerXiBang.score = 21;

  settlement = XiDachEngine.calculatePlayerSettlement(botXiDach, dealerXiBang, 10000);
  console.log('Result:', settlement);
  if (settlement.amount === -40000 && settlement.result === 'lose') {
    console.log('✅ PASS: Dealer Xi Bang takes priority x4 over Player Xi Dach');
  } else {
    console.error('❌ FAIL: Special hand hierarchy check failed');
  }

  // Case 5: Bot Den (>= 28 pts)
  console.log('\n[TEST 5] Bot Den (>= 28 pts)');
  const botDen: Player = {
    ...botProfile,
    status: 'den',
    score: 28,
    currentBet: 10000
  };
  // Table total bets = 10k (bot 1) + 10k (bot 2) = 20k
  settlement = XiDachEngine.calculatePlayerSettlement(botDen, dealer17, 20000);
  console.log('Result:', settlement);
  if (settlement.amount === -20000 && settlement.result === 'lose') {
    console.log('✅ PASS: Den penalty is total table bets (20k)');
  } else {
    console.error('❌ FAIL: Den penalty calculation incorrect');
  }

  console.log('\n--- VALIDATION COMPLETE ---');
}

runTest();
