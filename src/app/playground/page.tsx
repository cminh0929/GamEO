'use client';

import React, { useState, useEffect } from 'react';
import { CardType, GameState, Player, CardType as Card, GameStatus } from '../../types/game';
import { DealerArea } from '../../components/xi-dach/DealerArea';
import { PlayerSeat } from '../../components/xi-dach/PlayerSeat';
import { SpectatorPanel } from '../../components/xi-dach/SpectatorPanel';
import { ChatPanel } from '../../components/xi-dach/ChatPanel';
import { useWindowScale } from '../../hooks/useWindowScale';

// Initial Mock Setup
const DEFAULT_DEALER: Player = {
  id: 'dealer-id',
  name: '👑 Nhà Cái (Mock)',
  hand: [
    { suit: 'hearts', rank: 'A', isRevealed: true },
    { suit: 'diamonds', rank: 'K', isRevealed: false },
  ],
  score: 21,
  status: 'stay',
  balance: 10000000,
  currentBet: 0,
  avatarUrl: 'https://i.pravatar.cc/150?img=12',
};

const DEFAULT_PLAYERS: Player[] = Array(7).fill(null).map((_, idx) => ({
  id: '',
  name: '',
  hand: [],
  score: 0,
  status: 'playing',
  balance: 0,
  currentBet: 0,
}));

// Populate a few initial players for an interesting startup state
DEFAULT_PLAYERS[1] = {
  id: 'user-1',
  name: 'Minh Hoàng',
  hand: [
    { suit: 'clubs', rank: '10', isRevealed: true },
    { suit: 'spades', rank: '7', isRevealed: true },
  ],
  score: 17,
  status: 'playing',
  balance: 2450000,
  currentBet: 50000,
  avatarUrl: 'https://i.pravatar.cc/150?img=68',
};

DEFAULT_PLAYERS[4] = {
  id: 'user-2',
  name: 'Khánh An',
  hand: [
    { suit: 'hearts', rank: 'A', isRevealed: true },
    { suit: 'diamonds', rank: 'A', isRevealed: true },
  ],
  score: 21,
  status: 'xi_bang',
  balance: 4800000,
  currentBet: 100000,
  avatarUrl: 'https://i.pravatar.cc/150?img=47',
};

const INITIAL_STATE: GameState = {
  deck: [],
  dealer: DEFAULT_DEALER,
  players: DEFAULT_PLAYERS,
  status: 'playing',
  turnIndex: 1, // Start on Minh Hoàng
  turnDeadline: Date.now() + 30000,
  lastActionAt: Date.now(),
  actionLogs: [
    '🤖 Hệ thống: Khởi tạo phòng chơi Playground thành công!',
    'Minh Hoàng đặt cược $50,000.',
    'Khánh An đặt cược $100,000.',
    'Khánh An nhận được Xì Bàng! 🎴',
  ],
};

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export default function PlaygroundPage() {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [myId] = useState<string>('user-1'); // Simulate user-1
  const [showLogs, setShowLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'actions' | 'transactions'>('actions');
  const [simulatedDevice, setSimulatedDevice] = useState<'desktop' | 'mobile-portrait' | 'mobile-landscape' | 'tablet-portrait'>('desktop');
  const [isPortrait, setIsPortrait] = useState(false);
  const scale = useWindowScale();
  const logEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-detect portrait/landscape within simulated boundaries or real viewport
  useEffect(() => {
    if (simulatedDevice === 'desktop') {
      setIsPortrait(window.innerHeight > window.innerWidth);
    } else if (simulatedDevice === 'mobile-portrait' || simulatedDevice === 'tablet-portrait') {
      setIsPortrait(true);
    } else {
      setIsPortrait(false);
    }
  }, [simulatedDevice]);

  // Sync scroll for logs
  useEffect(() => {
    if (showLogs && activeTab === 'actions') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameState.actionLogs, showLogs, activeTab]);

  // Helper: Calculate Score
  const calculateScore = (hand: CardType[]): number => {
    let score = 0;
    let aces = 0;
    for (const card of hand) {
      if (card.rank === 'A') {
        aces++;
      } else if (['J', 'Q', 'K'].includes(card.rank)) {
        score += 10;
      } else {
        score += parseInt(card.rank);
      }
    }
    for (let i = 0; i < aces; i++) {
      if (score + 11 <= 21) {
        score += 11;
      } else {
        score += 1;
      }
    }
    return score;
  };

  // Helper: Add Action Log
  const log = (msg: string) => {
    setGameState((prev) => ({
      ...prev,
      actionLogs: [...(prev.actionLogs || []), msg],
    }));
  };

  // Draw Card Helper
  const getRandomCard = (isRevealed = true): CardType => {
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    return { suit, rank, isRevealed };
  };

  // Mock Actions
  const actions = {
    takeRole: (role: 'player' | 'dealer', seatIdx?: number) => {
      if (role === 'dealer') {
        setGameState((prev) => ({
          ...prev,
          dealer: {
            ...prev.dealer,
            id: 'dealer-id',
            name: '👑 Nhà Cái (Mock)',
            balance: 10000000,
          },
        }));
        log('Bạn đã nhận vai trò làm Nhà Cái 👑');
      } else if (seatIdx !== undefined) {
        setGameState((prev) => {
          const players = [...prev.players];
          players[seatIdx] = {
            id: 'my-mock-user',
            name: 'Bạn (Playground)',
            hand: [],
            score: 0,
            status: 'playing',
            balance: 5000000,
            currentBet: 0,
            avatarUrl: 'https://i.pravatar.cc/150?img=33',
          };
          return { ...prev, players };
        });
        log(`Bạn đã ngồi vào vị trí ${seatIdx + 1} 🪑`);
      }
    },
    leaveRole: () => {
      setGameState((prev) => {
        let players = [...prev.players];
        const mySeatIdx = players.findIndex((p) => p.id === 'my-mock-user' || p.id === myId);
        if (mySeatIdx !== -1) {
          players[mySeatIdx] = {
            id: '',
            name: '',
            hand: [],
            score: 0,
            status: 'playing',
            balance: 0,
            currentBet: 0,
          };
        }
        return {
          ...prev,
          players,
          dealer: prev.dealer.id === 'my-mock-user' ? { ...prev.dealer, id: '' } : prev.dealer,
        };
      });
      log('Bạn đã rời khỏi bàn chơi 👋');
    },
    kickPlayer: (index: number | 'dealer') => {
      setGameState((prev) => {
        if (index === 'dealer') {
          return {
            ...prev,
            dealer: { ...prev.dealer, id: '' },
          };
        }
        const players = [...prev.players];
        const name = players[index].name;
        players[index] = {
          id: '',
          name: '',
          hand: [],
          score: 0,
          status: 'playing',
          balance: 0,
          currentBet: 0,
        };
        log(`Kích người chơi ${name} khỏi ghế ${index + 1} ❌`);
        return { ...prev, players };
      });
    },
    placeBet: (seatIdx: number, amount: number) => {
      setGameState((prev) => {
        const players = [...prev.players];
        const p = players[seatIdx];
        if (p.balance < amount) return prev;
        players[seatIdx] = {
          ...p,
          currentBet: amount,
          balance: p.balance - amount,
        };
        log(`${p.name} đặt cược $${amount.toLocaleString()} 🪙`);
        return { ...prev, players };
      });
    },
    hit: (seatIdx: number) => {
      setGameState((prev) => {
        const players = [...prev.players];
        const p = players[seatIdx];
        const newCard = getRandomCard();
        const hand = [...p.hand, newCard];
        const score = calculateScore(hand);
        
        let status = p.status;
        if (score > 21) {
          status = 'bust';
          log(`${p.name} bị Quá (Bust) với ${score} điểm! 💥`);
        } else if (hand.length === 5) {
          status = 'ngu_linh';
          log(`${p.name} đạt Ngũ Linh! 🎉`);
        }

        players[seatIdx] = { ...p, hand, score, status };
        return { ...prev, players };
      });
    },
    stand: (seatIdx: number) => {
      setGameState((prev) => {
        const players = [...prev.players];
        const p = players[seatIdx];
        players[seatIdx] = { ...p, status: 'stay' };
        log(`${p.name} chọn Dằn bài ở ${p.score} điểm. 🛑`);
        
        // Advance turn automatically to next seated active player or dealer
        let nextTurn = seatIdx + 1;
        while (nextTurn < 7 && players[nextTurn].id === '') {
          nextTurn++;
        }
        if (nextTurn >= 7) {
          nextTurn = -1; // Dealer's turn
          log('Đã đến lượt Nhà Cái xét bài! 👑');
        }

        return { ...prev, turnIndex: nextTurn };
      });
    },
    checkPlayer: (seatIdx: number) => {
      setGameState((prev) => {
        const players = [...prev.players];
        players[seatIdx] = { ...players[seatIdx], isChecked: true };
        log(`Nhà Cái xét bài người chơi tại vị trí ${seatIdx + 1} ⚖️`);
        return { ...prev, players };
      });
    },
    checkAllPlayers: (isAuto = false) => {
      setGameState((prev) => {
        const players = prev.players.map((p) => p.id !== '' ? { ...p, isChecked: true } : p);
        log(`Nhà Cái xét toàn bộ người chơi trong phòng ⚖️`);
        return { ...prev, players };
      });
    },
    dealerHit: () => {
      setGameState((prev) => {
        const newCard = getRandomCard();
        const hand = [...prev.dealer.hand, newCard];
        const score = calculateScore(hand);
        
        let status = prev.dealer.status;
        if (score > 21) {
          status = 'bust';
          log(`Nhà Cái bị Quá (Bust) với ${score} điểm! 💥`);
        }

        return {
          ...prev,
          dealer: { ...prev.dealer, hand, score, status },
        };
      });
    },
    resetTableToEmpty: () => {
      setGameState({
        deck: [],
        dealer: DEFAULT_DEALER,
        players: DEFAULT_PLAYERS,
        status: 'betting',
        turnIndex: 0,
        turnDeadline: Date.now() + 30000,
        lastActionAt: Date.now(),
        actionLogs: ['🤖 Hệ thống: Làm mới bàn chơi (Bắt đầu đặt cược)!'],
      });
    },
    startNewGame: () => {
      setGameState((prev) => {
        const players = prev.players.map((p) => {
          if (p.id === '') return p;
          return {
            ...p,
            hand: [getRandomCard(), getRandomCard()],
            status: 'playing' as const,
            isChecked: false,
          };
        });
        
        // Find first seated player index
        const firstPlayerIdx = players.findIndex((p) => p.id !== '');

        return {
          ...prev,
          status: 'playing',
          players,
          dealer: {
            ...prev.dealer,
            hand: [getRandomCard(), getRandomCard(false)],
            status: 'playing',
          },
          turnIndex: firstPlayerIdx !== -1 ? firstPlayerIdx : -1,
        };
      });
      log('Trận đấu mới bắt đầu! Bài đã được chia. 🎴');
    },
  };

  const profile = {
    id: 'user-1',
    username: 'Minh Hoàng',
    role: 'admin',
    balance: 2450000,
    avatar_url: 'https://i.pravatar.cc/150?img=68'
  } as any;
  const isAdmin = true;

  const mySeatIndex = gameState.players.findIndex((p) => p.id === profile?.id || p.id === 'my-mock-user');
  const myPlayer = mySeatIndex !== -1 ? gameState.players[mySeatIndex] : null;
  const isMyTurn = gameState.status === 'playing' && gameState.turnIndex === mySeatIndex && mySeatIndex !== -1;
  const isDealer = gameState.dealer.id === profile?.id;

  const seatedPlayers = gameState.players.filter((p) => p.id !== '');
  const allPlayersDone = seatedPlayers.length > 0 &&
    seatedPlayers.every((p) => p.status === 'stay' || p.status === 'bust') &&
    seatedPlayers.some((p) => !p.isChecked);
  const showCheckAll = isDealer && gameState.status === 'playing' && gameState.turnIndex === -1 && allPlayersDone;

  // Render Simulated Device wrapper
  const getDeviceStyle = () => {
    switch (simulatedDevice) {
      case 'mobile-portrait':
        return { width: '360px', height: '740px', border: '12px solid #333', borderRadius: '40px', overflowY: 'auto' as const, position: 'relative' as const, boxShadow: '0 25px 60px rgba(0,0,0,0.8)' };
      case 'mobile-landscape':
        return { width: '740px', height: '360px', border: '12px solid #333', borderRadius: '40px', overflowY: 'auto' as const, position: 'relative' as const, boxShadow: '0 25px 60px rgba(0,0,0,0.8)' };
      case 'tablet-portrait':
        return { width: '480px', height: '640px', border: '12px solid #333', borderRadius: '30px', overflowY: 'auto' as const, position: 'relative' as const, boxShadow: '0 25px 60px rgba(0,0,0,0.8)' };
      default:
        return { width: '100%', height: '100%', border: 'none' };
    }
  };

  return (
    <div style={{ display: 'flex', background: '#0a0a0f', minHeight: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {/* LEFT: MOCK GAME VIEWPORT CONTAINER */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflow: 'auto', borderRight: '1.5px solid rgba(212,175,55,0.1)' }}>
        <div style={getDeviceStyle()} className={simulatedDevice !== 'desktop' ? 'simulated-frame' : ''}>
          
          <main className={`game-arena-container ${isPortrait ? 'portrait-mode' : ''}`} style={{ width: '100%', height: '100%', minHeight: simulatedDevice !== 'desktop' ? '100%' : '100vh' }}>
            
            {/* Top header bar */}
            <div className="game-top-bar">
              <div className="brand">
                <span className="logo-icon">👑</span>
                <span className="logo-text">GAMEO</span>
              </div>
              <div className="balance-badge">
                <span className="balance-value">🪙 MOCK PLAYGROUND</span>
              </div>
              <div className="profile-widget">
                <img src={profile.avatar_url || 'https://i.pravatar.cc/150?img=68'} className="avatar" alt="Avatar" />
                <span className="username">{profile.username}</span>
              </div>
            </div>

            {/* Main Board felt */}
            {isPortrait ? (
              /* Mobile Portrait Grid Layout */
              <div className="portrait-grid-felt">
                <DealerArea
                  dealer={gameState.dealer}
                  gameState={gameState}
                  profile={profile}
                  onDealerHit={actions.dealerHit}
                  onResetTable={actions.resetTableToEmpty}
                  onTakeDealer={() => actions.takeRole('dealer')}
                  onKick={actions.kickPlayer}
                  isAdmin={isAdmin}
                />
                
                <div className="grid-status-header">
                  {gameState.status === 'betting' ? '⌛ ĐANG ĐẶT CƯỢC...' : `🎴 LƯỢT: ${gameState.turnIndex === -1 ? 'NHÀ CÁI' : gameState.players[gameState.turnIndex]?.name || 'TRỐNG'}`}
                </div>

                <div className="portrait-players-grid">
                  {gameState.players.map((player, idx) => (
                    <PlayerSeat
                      key={idx}
                      player={player}
                      index={idx}
                      gameState={gameState}
                      profile={profile}
                      timeLeft={15}
                      onSit={(i) => actions.takeRole('player', i)}
                      onKick={actions.kickPlayer}
                      onPlaceBet={actions.placeBet}
                      onHit={actions.hit}
                      onStand={actions.stand}
                      onCheckPlayer={actions.checkPlayer}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* Standard Desktop/Landscape Oval Layout */
              <div className="casino-table" style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
                <div className="table-felt">
                  <div className="felt-inner">
                    <div className="table-logo">GAMEO PLAYGROUND</div>

                    <DealerArea
                      dealer={gameState.dealer}
                      gameState={gameState}
                      profile={profile}
                      onDealerHit={actions.dealerHit}
                      onResetTable={actions.resetTableToEmpty}
                      onTakeDealer={() => actions.takeRole('dealer')}
                      onKick={actions.kickPlayer}
                      isAdmin={isAdmin}
                    />

                    <div className="game-status-msg">
                      {gameState.status === 'betting' ? '⌛ ĐANG ĐẶT CƯỢC...' : `🎴 LƯỢT: ${gameState.turnIndex === -1 ? 'NHÀ CÁI' : gameState.players[gameState.turnIndex]?.name || 'TRỐNG'}`}
                    </div>
                  </div>
                </div>

                {gameState.players.map((player, idx) => (
                  <PlayerSeat
                    key={idx}
                    player={player}
                    index={idx}
                    gameState={gameState}
                    profile={profile}
                    timeLeft={15}
                    onSit={(i) => actions.takeRole('player', i)}
                    onKick={actions.kickPlayer}
                    onPlaceBet={actions.placeBet}
                    onHit={actions.hit}
                    onStand={actions.stand}
                    onCheckPlayer={actions.checkPlayer}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}

            {/* Sidebar toggleable board logs */}
            <div className={`transaction-sidebar ${showLogs ? 'is-open' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📋 LỊCH SỬ BÀN MOCK</h3>
                  <button className="btn-close-sidebar" onClick={() => setShowLogs(false)}>×</button>
                </div>
              </div>
              <div className="action-log-list" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', padding: '16px' }}>
                {gameState.actionLogs?.map((logMsg, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #d4af37', fontSize: '0.85rem', color: '#eee', fontFamily: 'monospace' }}>
                    {logMsg}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            <button className="btn-toggle-logs" onClick={() => setShowLogs(!showLogs)}>
              📜
            </button>

            {/* Touch Action controls overlay for mobile preview */}
            {(isMyTurn || (gameState.status === 'betting' && myPlayer && myPlayer.currentBet === 0) || (isDealer && gameState.status === 'playing' && gameState.turnIndex === -1)) && (
              <div className="mobile-touch-actions-bar">
                {/* 1. BETTING */}
                {gameState.status === 'betting' && myPlayer && myPlayer.currentBet === 0 && (
                  <div className="touch-chip-container">
                    <span className="touch-label">🪙 CƯỢC NHANH:</span>
                    <div className="touch-chips-grid">
                      {[10000, 50000, 100000, 200000, 500000].map((amount) => (
                        <button
                          key={amount}
                          className="btn-touch-chip"
                          onClick={() => actions.placeBet(mySeatIndex, amount)}
                        >
                          ${amount >= 1000 ? `${amount / 1000}K` : amount}
                        </button>
                      ))}
                      <button className="btn-touch-chip max" onClick={() => actions.placeBet(mySeatIndex, 500000)}>
                        TẤT TAY
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. PLAYING ACTIONS */}
                {isMyTurn && (
                  <div className="touch-action-buttons">
                    <button className="btn-touch-large stand" onClick={() => actions.stand(mySeatIndex)}>
                      🔴 DẰN BÀI (STAND)
                    </button>
                    <button className="btn-touch-large hit" onClick={() => actions.hit(mySeatIndex)}>
                      🟢 RÚT BÀI (HIT)
                    </button>
                  </div>
                )}

                {/* 3. DEALER */}
                {isDealer && gameState.status === 'playing' && gameState.turnIndex === -1 && (
                  <div className="touch-action-buttons">
                    <button className="btn-touch-large hit dealer" onClick={() => actions.dealerHit()}>
                      👑 NHÀ CÁI RÚT BÀI
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Controls */}
            <div className="bottom-controls">
              {showCheckAll && (
                <button className="btn-main" style={{ background: 'linear-gradient(135deg,#e74c3c,#c0392b)' }} onClick={() => actions.checkAllPlayers(false)}>
                  ⚖️ XÉT TẤT CẢ
                </button>
              )}
              {isDealer && !showCheckAll && (
                <button className="btn-main" onClick={actions.startNewGame}>
                  {gameState.status === 'ended' ? 'BẮT ĐẦU VÁN MỚI' : gameState.status === 'betting' ? 'CHIA BÀI' : 'RESET VÁN'}
                </button>
              )}
              <button className="btn-leave" onClick={actions.leaveRole}>Rời bàn</button>
            </div>

            <div className="version-badge">v1.0.3-playground</div>
          </main>

        </div>
      </div>

      {/* RIGHT: INTERACTIVE CONTROL PANEL */}
      <div style={{ width: '320px', background: 'rgba(10, 11, 15, 0.98)', borderLeft: '1.5px solid rgba(212,175,55,0.2)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', color: '#fff', overflowY: 'auto' }}>
        <div>
          <h2 style={{ color: '#d4af37', margin: '0 0 4px 0', fontSize: '1.3rem', fontWeight: 900 }}>🛠️ PLAYGROUND</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: '0.8rem' }}>Môi trường giả lập giao diện di động & PC độc lập</p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px dashed rgba(212,175,55,0.2)', margin: 0 }} />

        {/* Device Simulation Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 900, color: '#d4af37' }}>📺 GIẢ LẬP THIẾT BỊ</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button
              onClick={() => setSimulatedDevice('desktop')}
              style={{ padding: '8px', fontSize: '0.75rem', background: simulatedDevice === 'desktop' ? '#d4af37' : '#222', color: simulatedDevice === 'desktop' ? '#000' : '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Desktop Oval
            </button>
            <button
              onClick={() => setSimulatedDevice('mobile-portrait')}
              style={{ padding: '8px', fontSize: '0.75rem', background: simulatedDevice === 'mobile-portrait' ? '#d4af37' : '#222', color: simulatedDevice === 'mobile-portrait' ? '#000' : '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Dọc 9:16 (Phone)
            </button>
            <button
              onClick={() => setSimulatedDevice('mobile-landscape')}
              style={{ padding: '8px', fontSize: '0.75rem', background: simulatedDevice === 'mobile-landscape' ? '#d4af37' : '#222', color: simulatedDevice === 'mobile-landscape' ? '#000' : '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Ngang 16:9 (Phone)
            </button>
            <button
              onClick={() => setSimulatedDevice('tablet-portrait')}
              style={{ padding: '8px', fontSize: '0.75rem', background: simulatedDevice === 'tablet-portrait' ? '#d4af37' : '#222', color: simulatedDevice === 'tablet-portrait' ? '#000' : '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Tablet 3:4 (iPad)
            </button>
          </div>
        </div>

        {/* Phase selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 900, color: '#d4af37' }}>🕹️ TIẾN TRÌNH VÁN ĐẤU</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {['betting', 'playing', 'ended'].map((status) => (
              <button
                key={status}
                onClick={() => setGameState(prev => ({ ...prev, status: status as GameStatus }))}
                style={{ padding: '8px', fontSize: '0.75rem', background: gameState.status === status ? '#d4af37' : '#222', color: gameState.status === status ? '#000' : '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase' }}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Active turn selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 900, color: '#d4af37' }}>👉 LƯỢT CHƠI HIỆN TẠI</label>
          <select
            value={gameState.turnIndex}
            onChange={(e) => setGameState(prev => ({ ...prev, turnIndex: parseInt(e.target.value) }))}
            style={{ padding: '8px', fontSize: '0.8rem', background: '#222', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}
          >
            <option value={-1}>👑 Lượt Nhà Cái</option>
            {gameState.players.map((p, idx) => (
              <option key={idx} value={idx}>
                Ghế {idx + 1} {p.name ? `(${p.name})` : '(Trống)'}
              </option>
            ))}
          </select>
        </div>

        {/* Quick hand injector presets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 900, color: '#d4af37' }}>🃏 BÀI ĐẶC BIỆT (GHẾ 2 - BẠN)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              onClick={() => {
                setGameState((prev) => {
                  const players = [...prev.players];
                  players[1] = {
                    ...players[1],
                    hand: [
                      { suit: 'hearts', rank: 'A', isRevealed: true },
                      { suit: 'diamonds', rank: 'A', isRevealed: true },
                    ],
                    score: 21,
                    status: 'xi_bang',
                  };
                  return { ...prev, players };
                });
                log('Cập nhật ghế 2: Xì Bàng (AA)! 🎴');
              }}
              style={{ padding: '8px', fontSize: '0.75rem', background: '#222', color: '#ffe082', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '6px', cursor: 'pointer', textAlign: 'left' }}
            >
              🔥 Xì Bàng (Át - Át)
            </button>
            <button
              onClick={() => {
                setGameState((prev) => {
                  const players = [...prev.players];
                  players[1] = {
                    ...players[1],
                    hand: [
                      { suit: 'hearts', rank: 'A', isRevealed: true },
                      { suit: 'diamonds', rank: 'J', isRevealed: true },
                    ],
                    score: 21,
                    status: 'xi_dach',
                  };
                  return { ...prev, players };
                });
                log('Cập nhật ghế 2: Xì Dách (AJ)! 🎴');
              }}
              style={{ padding: '8px', fontSize: '0.75rem', background: '#222', color: '#ffe082', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '6px', cursor: 'pointer', textAlign: 'left' }}
            >
              🔥 Xì Dách (Át - J)
            </button>
            <button
              onClick={() => {
                setGameState((prev) => {
                  const players = [...prev.players];
                  players[1] = {
                    ...players[1],
                    hand: [
                      { suit: 'hearts', rank: '3', isRevealed: true },
                      { suit: 'diamonds', rank: '2', isRevealed: true },
                      { suit: 'clubs', rank: '4', isRevealed: true },
                      { suit: 'spades', rank: '2', isRevealed: true },
                      { suit: 'hearts', rank: '5', isRevealed: true },
                    ],
                    score: 16,
                    status: 'ngu_linh',
                  };
                  return { ...prev, players };
                });
                log('Cập nhật ghế 2: Ngũ Linh (5 lá <= 21 điểm)! 🎴');
              }}
              style={{ padding: '8px', fontSize: '0.75rem', background: '#222', color: '#ffe082', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '6px', cursor: 'pointer', textAlign: 'left' }}
            >
              🔥 Ngũ Linh (16 điểm - 5 lá)
            </button>
            <button
              onClick={() => {
                setGameState((prev) => {
                  const players = [...prev.players];
                  players[1] = {
                    ...players[1],
                    hand: [
                      { suit: 'hearts', rank: '10', isRevealed: true },
                      { suit: 'diamonds', rank: 'K', isRevealed: true },
                      { suit: 'clubs', rank: '9', isRevealed: true },
                    ],
                    score: 29,
                    status: 'den',
                  };
                  return { ...prev, players };
                });
                log('Cập nhật ghế 2: Đền Bài (>= 28 điểm)! 💥');
              }}
              style={{ padding: '8px', fontSize: '0.75rem', background: '#222', color: '#ff8a80', border: '1px solid rgba(239,83,80,0.2)', borderRadius: '6px', cursor: 'pointer', textAlign: 'left' }}
            >
              💥 Đền Bài (29 điểm - Quá 28đ)
            </button>
          </div>
        </div>

        {/* Seat configuration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 900, color: '#d4af37' }}>👥 CẤU HÌNH GHẾ NGỒI</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {gameState.players.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#181824', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem' }}>
                <span>Ghế {idx + 1}: {p.name ? p.name : <em style={{ color: 'rgba(255,255,255,0.3)' }}>Trống</em>}</span>
                {p.name ? (
                  <button
                    onClick={() => actions.kickPlayer(idx)}
                    style={{ background: '#e74c3c', border: 'none', color: '#fff', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '0.65rem' }}
                  >
                    Đuổi
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setGameState((prev) => {
                        const players = [...prev.players];
                        players[idx] = {
                          id: `mock-user-${idx}`,
                          name: `Người chơi ${idx + 1}`,
                          hand: [getRandomCard(), getRandomCard()],
                          score: 15,
                          status: 'playing',
                          balance: 1000000,
                          currentBet: 10000,
                          avatarUrl: `https://i.pravatar.cc/150?img=${idx + 20}`,
                        };
                        return { ...prev, players };
                      });
                      log(`Thêm người chơi ở ghế ${idx + 1}`);
                    }}
                    style={{ background: '#27ae60', border: 'none', color: '#fff', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '0.65rem' }}
                  >
                    Ngồi
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 'auto', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
          GamEO Playground DevTools © 2026
        </div>
      </div>

    </div>
  );
}
