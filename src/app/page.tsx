'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CardType, GameState, Player, GameStatus } from '../types/game';
import { createDeck, shuffle, calculateScore, checkSpecialHands } from '../lib/gameLogic';
import { Card } from '../components/Card';
import { supabase } from '../lib/supabase';
import { Auth } from '../components/Auth';
import { AvatarPicker } from '../components/AvatarPicker';
import { PRESET_AVATARS } from '../lib/constants';

const ROOM_ID = 'gameo-table-1';
export const dynamic = 'force-dynamic';

interface TransactionLog {
  id: string;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

export default function GameDashboard() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [idleTimeLeft, setIdleTimeLeft] = useState<number>(60);
  const [lastKeyPressed, setLastKeyPressed] = useState<string>('');
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const [gameState, setGameState] = useState<GameState>({
    deck: [],
    dealer: { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 },
    players: Array.from({ length: 7 }, (_, i) => ({
      id: '', name: `Vị trí ${i + 1}`, hand: [], score: 0, status: 'playing', isChecked: false, gameResult: null, balance: 0, currentBet: 0,
    })),
    status: 'ended',
    turnIndex: 0,
    lastActionAt: Date.now(),
  });

  // --- 1. QUẢN LÝ SESSION & PROFILE ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchInitialData(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchInitialData(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchInitialData = useCallback((userId: string) => {
    fetchProfile(userId);
    fetchLogs(userId);
    subscribeToProfileChanges(userId);
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) return;
    if (data) {
      if (data.balance === 0) {
        await executeTransaction(userId, 10000000, 'gift', 'Tặng vốn khởi nghiệp');
      } else {
        setProfile(data);
      }
    }
  };

  const subscribeToProfileChanges = (userId: string) => {
    supabase.channel(`profile-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => setProfile(payload.new)).subscribe();
  };

  // --- 2. HỆ THỐNG TÀI CHÍNH ( TRANSACTION LOGS ) ---
  const fetchLogs = async (userId: string) => {
    const { data } = await supabase.from('transaction_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(15);
    if (data) setLogs(data);
  };

  const executeTransaction = async (userId: string, amount: number, type: string, description: string) => {
    if (!userId) return;
    try {
      const { data: currentProfile, error: fetchError } = await supabase.from('profiles').select('balance').eq('id', userId).single();
      if (fetchError || !currentProfile) throw new Error("Không tìm thấy profile");
      
      const newBalance = (currentProfile.balance || 0) + amount;
      const { error: updateError } = await supabase.from('profiles').update({ balance: newBalance }).eq('id', userId);
      
      if (!updateError) {
        await supabase.from('transaction_logs').insert({ user_id: userId, amount, type, description });
        fetchLogs(userId);
      }
    } catch (err) {
      console.error("Transaction Error:", err);
    }
  };

  // --- 3. ĐỒNG BỘ GAME STATE ---
  useEffect(() => {
    const fetchGame = async () => {
      const { data } = await supabase.from('game_rooms').select('game_state').eq('id', ROOM_ID).single();
      if (data) setGameState(data.game_state);
    };
    fetchGame();
    const channel = supabase.channel('room-1').on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${ROOM_ID}` },
      (payload) => setGameState(payload.new.game_state)
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // --- 4. TIMER & AUTO-RESET LOGIC ---
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (gameState.status === 'playing' && gameState.turnDeadline) {
        const diff = Math.max(0, Math.floor((gameState.turnDeadline! - now) / 1000));
        setTimeLeft(diff);
        // Tự động Dừng nếu hết giờ (chỉ cho người chơi hiện tại)
        const myPlayerIndex = gameState.players.findIndex(p => p.id === profile?.id);
        if (diff === 0 && gameState.turnIndex === myPlayerIndex) {
          stand(gameState.turnIndex);
        }
      } else {
        setTimeLeft(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.status, gameState.turnDeadline, gameState.turnIndex, profile?.id]);

  useEffect(() => {
    let timer: any;
    if (gameState.dealer.id !== '') {
      timer = setInterval(() => {
        const now = Date.now();
        const diff = Math.floor((now - (gameState.lastActionAt || now)) / 1000);
        const remaining = 60 - diff;

        if (remaining <= 0) {
          const newState = { ...gameState, status: 'ended' as GameStatus, lastActionAt: Date.now() };
          newState.dealer = { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 };
          newState.players.forEach(p => {
            p.hand = []; p.currentBet = 0; p.gameResult = null; p.isChecked = false; p.status = 'playing';
          });
          updateRemoteState(newState);
          setIdleTimeLeft(60);
        } else {
          setIdleTimeLeft(remaining);
        }
      }, 1000);
    } else {
      setIdleTimeLeft(60);
    }
    return () => clearInterval(timer);
  }, [gameState.dealer.id, gameState.lastActionAt]);

  const resetTableToEmpty = async () => {
    const emptyState: GameState = {
      deck: [],
      dealer: { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 },
      players: Array.from({ length: 7 }, (_, i) => ({
        id: '', name: `Vị trí ${i + 1}`, hand: [], score: 0, status: 'playing', isChecked: false, gameResult: null, balance: 0, currentBet: 0,
      })),
      status: 'ended',
      turnIndex: 0,
      lastActionAt: Date.now(),
    };
    await supabase.from('game_rooms').update({ game_state: emptyState }).eq('id', ROOM_ID);
  };

  const updateRemoteState = async (newState: GameState) => {
    setGameState(newState);
    await supabase.from('game_rooms').update({ game_state: newState }).eq('id', ROOM_ID);
  };

  const getNextTurnState = (currentState: GameState) => {
    let nextIdx = currentState.turnIndex + 1;
    while (nextIdx < currentState.players.length && currentState.players[nextIdx].id === '') nextIdx++;

    if (nextIdx >= currentState.players.length) {
      return { ...currentState, turnIndex: -1, turnDeadline: 0 };
    }
    return { ...currentState, turnIndex: nextIdx, turnDeadline: Date.now() + 30000 };
  };

  // --- 5. GAME ACTIONS ---
  const takeRole = (type: 'dealer' | 'player', index?: number) => {
    if (!profile) return;
    const alreadySeated = gameState.players.some(p => p.id === profile.id) || gameState.dealer.id === profile.id;
    if (alreadySeated) return alert("Bạn đã có vị trí rồi!");

    const newState = { ...gameState, lastActionAt: Date.now() };
    if (type === 'dealer') {
      newState.dealer = { ...newState.dealer, id: profile.id, name: `${profile.username} 👑`, balance: profile.balance, avatarUrl: profile.avatar_url };
    } else if (index !== undefined) {
      newState.players[index] = { ...newState.players[index], id: profile.id, name: profile.username, balance: profile.balance, avatarUrl: profile.avatar_url };
    }
    updateRemoteState(newState);
  };

  const kickPlayer = (index: number) => {
    if (gameState.dealer.id !== profile?.id) return;
    if (gameState.status === 'playing') return alert("Không thể kích người chơi khi đang trong ván bài!");
    const newState = { ...gameState, lastActionAt: Date.now() };
    newState.players[index] = { id: '', name: `Vị trí ${index + 1}`, hand: [], score: 0, status: 'playing', isChecked: false, gameResult: null, balance: 0, currentBet: 0 };
    updateRemoteState(newState);
  };

  const leaveRole = async () => {
    if (!profile) return;
    const newState = { ...gameState, lastActionAt: Date.now() };
    const isGameActive = gameState.status === 'playing';

    if (newState.dealer.id === profile.id) {
      const isRoomActive = gameState.status === 'playing' || gameState.status === 'betting';
      if (isRoomActive) {
        newState.status = 'ended';
        newState.players.forEach(p => {
          p.hand = [];
          p.currentBet = 0;
          p.gameResult = null;
          p.isChecked = false;
          p.status = 'playing';
        });
      }
      newState.dealer = { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 };
    } else {
      const pIdx = newState.players.findIndex(p => p.id === profile.id);
      if (pIdx !== -1) {
        const player = newState.players[pIdx];
        if (isGameActive && player.hand.length > 0 && !player.isChecked) {
          const bet = player.currentBet;
          await executeTransaction(player.id, -bet, 'penalty', 'Phạt thoát ván bài (Rage Quit)');
          if (newState.dealer.id) await executeTransaction(newState.dealer.id, bet, 'win', `Nhà Cái hưởng tiền từ ${player.name} thoát bàn`);
          newState.dealer.balance += bet;
        }
        newState.players[pIdx] = { id: '', name: `Vị trí ${pIdx + 1}`, hand: [], score: 0, status: 'playing', isChecked: false, gameResult: null, balance: 0, currentBet: 0 };
        // Nếu thoát đúng lượt, phải chuyển lượt
        if (gameState.turnIndex === pIdx) {
          const next = getNextTurnState(newState);
          newState.turnIndex = next.turnIndex;
          newState.turnDeadline = next.turnDeadline;
        }
      }
    }
    updateRemoteState(newState);
  };

  const placeBet = async (index: number, amount: number) => {
    if (!profile || amount <= 0) return;
    if (amount > profile.balance) return alert("Không đủ tiền!");
    const newState = { ...gameState, lastActionAt: Date.now() };
    newState.players[index].currentBet = amount;
    updateRemoteState(newState);
  };

  const startNewGame = () => {
    if (gameState.dealer.id !== profile?.id) return alert("Chỉ Nhà Cái mới được bắt đầu!");

    if (gameState.status !== 'betting') {
      const newState = { ...gameState, status: 'betting' as GameStatus, lastActionAt: Date.now() };
      newState.players.forEach(p => { p.currentBet = 0; p.gameResult = null; p.isChecked = false; p.hand = []; p.status = 'playing'; });
      updateRemoteState(newState);
      return;
    }

    const activePlayers = gameState.players.filter(p => p.id !== '');
    if (activePlayers.length === 0) return alert("Cần ít nhất 1 người chơi để bắt đầu!");
    if (activePlayers.some(p => p.currentBet <= 0)) return alert("Còn người chưa cược!");

    let newDeck = shuffle(createDeck());
    const dealerHand = [newDeck.pop()!, newDeck.pop()!];
    const updatedPlayers = gameState.players.map(p => {
      if (p.id === '') return p;
      const hand = [newDeck.pop()!, newDeck.pop()!];
      return { ...p, hand: hand as CardType[], score: calculateScore(hand as CardType[]), status: 'playing' as any, isChecked: false };
    });

    const firstPlayerIndex = updatedPlayers.findIndex(p => p.id !== '');
    updateRemoteState({
      ...gameState, deck: newDeck,
      dealer: { ...gameState.dealer, hand: dealerHand as CardType[], score: calculateScore(dealerHand as CardType[]), status: 'playing' },
      players: updatedPlayers, status: 'playing',
      turnIndex: firstPlayerIndex !== -1 ? firstPlayerIndex : 0,
      turnDeadline: Date.now() + 30000,
      lastActionAt: Date.now()
    });
  };

  const hit = (idx: number) => {
    if (gameState.turnIndex !== idx) return;
    const player = gameState.players[idx];
    if (player.hand.length >= 5) return alert("Đã đạt giới hạn tối đa 5 lá bài!");

    const newDeck = [...gameState.deck];
    const newCard = newDeck.pop()!;
    const updatedPlayers = [...gameState.players];
    const newHand = [...player.hand, newCard];
    const newScore = calculateScore(newHand);

    const isPenalty = newScore >= 28;
    const isMaxCards = newHand.length === 5;

    if (isPenalty) {
      const otherPlayers = gameState.players.filter(p => p.id !== '' && p.id !== profile?.id);
      const totalTableBet = otherPlayers.reduce((sum, p) => sum + p.currentBet, 0) + player.currentBet;
      executeTransaction(player.id, -totalTableBet, 'penalty', `ĐỀN NGUYÊN BÀN (Quắc ${newScore}đ)`);
      if (gameState.dealer.id) executeTransaction(gameState.dealer.id, totalTableBet, 'win', `Nhà Cái thu tiền đền nguyên bàn từ ${player.name}`);
      alert(`BẠN BỊ ĐỀN NGUYÊN BÀN! Mất tổng cộng $${totalTableBet.toLocaleString()} cho Nhà Cái.`);
      updatedPlayers[idx] = { ...player, hand: newHand, score: newScore, status: 'bust', isChecked: true };
    } else {
      updatedPlayers[idx] = { ...player, hand: newHand, score: newScore, status: isMaxCards ? 'stay' : 'playing' };
    }

    const nextState = { ...gameState, deck: newDeck, players: updatedPlayers, lastActionAt: Date.now() };
    const finalState = (isPenalty || isMaxCards) ? getNextTurnState(nextState) : nextState;

    updateRemoteState(finalState);
  };

  const stand = (idx: number) => {
    if (gameState.turnIndex !== idx) return;
    const updatedPlayers = [...gameState.players];
    updatedPlayers[idx].status = 'stay';
    updateRemoteState(getNextTurnState({ ...gameState, players: updatedPlayers, lastActionAt: Date.now() }));
  };

  const checkPlayer = async (idx: number) => {
    if (gameState.dealer.id !== profile?.id) return;
    const dealerScore = calculateScore(gameState.dealer.hand);
    if (dealerScore < 15 && gameState.dealer.hand.length < 5) return alert("Nhà Cái phải đủ ít nhất 15 điểm hoặc 5 lá bài mới được quyền XÉT!");

    const updatedPlayers = [...gameState.players];
    const player = updatedPlayers[idx];
    const bet = player.currentBet;
    let multiplier = 1;
    const playerSpecial = checkSpecialHands(player);
    const dealerSpecial = checkSpecialHands(gameState.dealer);

    let result: 'win' | 'lose' | 'draw' = 'draw';
    if (playerSpecial === 'xi_bang' || playerSpecial === 'xi_dach') {
      if (dealerSpecial === playerSpecial) result = 'draw';
      else { result = 'win'; multiplier = playerSpecial === 'xi_bang' ? 4 : 3; }
    } else if (dealerSpecial === 'xi_bang' || dealerSpecial === 'xi_dach') {
      result = 'lose';
    } else if (player.score > 21) {
      result = 'lose';
    } else if (playerSpecial === 'ngu_linh') {
      if (dealerSpecial === 'ngu_linh') result = 'draw';
      else { result = 'win'; multiplier = 2; }
    } else if (dealerScore > 21) {
      result = 'win';
    } else if (dealerScore > player.score) {
      result = 'lose';
    } else if (dealerScore < player.score) {
      result = 'win';
    } else {
      result = 'draw';
    }

    const finalWinAmount = bet * multiplier;
    if (result === 'win') {
      await executeTransaction(player.id, finalWinAmount, 'win', `Thắng ván bài (${playerSpecial || player.score + 'đ'}) x${multiplier}`);
      await executeTransaction(gameState.dealer.id, -finalWinAmount, 'lose', `Thua cho ${player.name}`);
    } else if (result === 'lose') {
      await executeTransaction(player.id, -bet, 'lose', `Thua ván bài (${player.score + 'đ'})`);
      await executeTransaction(gameState.dealer.id, bet, 'win', `Thắng từ ${player.name}`);
    }
    updatedPlayers[idx] = { ...player, isChecked: true, gameResult: result };
    updateRemoteState({ ...gameState, players: updatedPlayers, lastActionAt: Date.now() });
  };

  const dealerHit = () => {
    if (gameState.dealer.id !== profile?.id) return;
    if (gameState.dealer.hand.length >= 5) return alert("Nhà Cái đã đạt giới hạn 5 lá bài!");
    if (gameState.players.some(p => p.id !== '' && p.isChecked)) return alert("Đã xét bài, không thể rút thêm!");
    const newDeck = [...gameState.deck];
    const newCard = newDeck.pop()!;
    const newHand = [...gameState.dealer.hand, newCard];
    updateRemoteState({ ...gameState, deck: newDeck, dealer: { ...gameState.dealer, hand: newHand, score: calculateScore(newHand) }, lastActionAt: Date.now() });
  };

  if (!session) return <Auth onSession={setSession} />;

  return (
    <main className="casino-container">
      {/* 1. Header & Balance */}
      <div className="casino-header">
        <h1 className="casino-title">XÌ DÁCH CASINO</h1>
        <div className="global-balance">
          💰 ${profile?.balance?.toLocaleString() || '0'}
        </div>
        {profile && (
          <div className="user-info">
            <div className="user-avatar-wrap" onClick={() => setShowAvatarPicker(true)}>
              <img src={profile.avatar_url || PRESET_AVATARS[0]} alt="Avatar" className="user-avatar-mini" />
            </div>
            <span className="user-name">{profile.username}</span>
            <button className="btn-logout" onClick={() => supabase.auth.signOut()}>Đăng xuất</button>
          </div>
        )}
      </div>

      {/* 2. Bàn chơi chính (Oval) */}
      <div className="casino-table">
        {/* Thảm xanh trung tâm */}
        <div className="table-felt">
          <div className="felt-inner">
            <div className="table-logo">GAMEO PREMIUM</div>

            {/* Khu vực Nhà Cái */}
            <div className="dealer-area">
              <div className="dealer-info">
                {gameState.dealer.avatarUrl && (
                  <img src={gameState.dealer.avatarUrl} alt="Dealer" className="dealer-avatar" />
                )}
                <span className={gameState.dealer.id ? "dealer-name" : "dealer-name empty"}>
                  {gameState.dealer.id ? gameState.dealer.name : "ĐANG TRỐNG"}
                </span>
                {gameState.dealer.id ? (
                  <span className="dealer-balance">${gameState.dealer.balance.toLocaleString()}</span>
                ) : (
                  !(gameState.players.some(p => p.id === profile?.id) || gameState.dealer.id === profile?.id) &&
                  <button className="btn-sit dealer" onClick={() => takeRole('dealer')}>LÀM NHÀ CÁI 👑</button>
                )}
              </div>
              <div className="hand">
                {gameState.dealer.hand.map((card, i) => {
                  const isMeChecked = gameState.players.some(p => p.id === profile?.id && p.isChecked);
                  const isVisible = gameState.dealer.id === profile?.id || gameState.status === 'ended' || isMeChecked;
                  return <Card key={i} card={isVisible ? card : { ...card, isRevealed: false }} index={i} />;
                })}
              </div>
              {gameState.dealer.id === profile?.id && (
                <div className="dealer-controls">
                  {gameState.status === 'playing' && gameState.turnIndex === -1 && (
                    <button className="btn-action hit" onClick={dealerHit}>Rút bài</button>
                  )}
                  {gameState.status !== 'playing' && (
                    <button className="btn-action reset" onClick={resetTableToEmpty}>Làm mới bàn</button>
                  )}
                </div>
              )}
            </div>

            {/* Thông báo Game Status */}
            <div className="game-status-msg">
              {gameState.status === 'betting' && "⌛ ĐANG ĐẶT CƯỢC..."}
              {gameState.status === 'playing' && (gameState.turnIndex === -1 ? "👑 LƯỢT NHÀ CÁI" : "🎴 LƯỢT NGƯỜI CHƠI")}
            </div>
          </div>
        </div>

        {/* 10 Ghế xung quanh (Vị trí Oval) */}
        {gameState.players.map((player, idx) => (
          <div key={idx} className={`player-box seat-${idx} ${player.id === profile?.id ? 'is-me' : ''} ${gameState.turnIndex === idx ? 'active-turn' : ''}`}>
            {/* Tên & Thời gian */}
            <div className="player-header">
              {player.avatarUrl && <img src={player.avatarUrl} alt="Avt" className="player-avatar-img" />}
              <span className="name">{player.name}</span>
              {gameState.turnIndex === idx && <span className="timer">{timeLeft}s</span>}
              {gameState.dealer.id === profile?.id && player.id !== '' && player.id !== profile.id && (
                <button className="btn-kick" onClick={(e) => { e.stopPropagation(); kickPlayer(idx); }}>❌</button>
              )}
            </div>

            {/* Bài người chơi */}
            <div className="hand">
              {player.hand.length > 0 ? player.hand.map((card, i) => {
                const isVisible = player.id === profile?.id || player.isChecked || gameState.status === 'ended';
                return <Card key={i} card={isVisible ? card : { ...card, isRevealed: false }} index={i} />;
              }) : player.id !== '' && <div className="waiting-text">{gameState.status === 'betting' ? 'Đặt cược...' : 'Chờ ván...'}</div>}
            </div>

            {/* Điểm & Kết quả */}
            {player.hand.length > 0 && (player.id === profile?.id || player.isChecked || gameState.status === 'ended') && (
              <div className="score-pill">
                {(() => {
                  const special = checkSpecialHands(player);
                  if (special) return special.toUpperCase().replace('_', ' ');
                  const s = calculateScore(player.hand);
                  return s > 21 ? `QUẮC (${s})` : `${s} ĐIỂM`;
                })()}
              </div>
            )}

            {/* Controls & Bet */}
            <div className="player-footer">
              {player.id === '' ? (
                !(gameState.players.some(p => p.id === profile?.id) || gameState.dealer.id === profile?.id) &&
                <button className="btn-sit" onClick={() => takeRole('player', idx)}>Ngồi đây</button>
              ) : (
                <>
                  <div className="bet-display">${player.currentBet.toLocaleString()}</div>
                      {player.id === profile?.id && gameState.status === 'betting' && (
                        <input 
                          type="number" 
                          className="bet-input" 
                          placeholder="Cược..." 
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              placeBet(idx, parseInt((e.target as HTMLInputElement).value));
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          onBlur={(e) => placeBet(idx, parseInt(e.target.value))} 
                        />
                      )}
                  {player.id === profile?.id && gameState.turnIndex === idx && (
                    <div className="action-row">
                      <button className="btn-mini hit" onClick={() => hit(idx)}>Rút</button>
                      <button className="btn-mini stand" onClick={() => stand(idx)}>Dừng</button>
                    </div>
                  )}
                  {gameState.dealer.id === profile?.id && gameState.turnIndex === -1 && player.hand.length > 0 && !player.isChecked && (
                    <button 
                      className="btn-mini check" 
                      onClick={() => checkPlayer(idx)} 
                      disabled={(calculateScore(gameState.dealer.hand) < 15 && gameState.dealer.hand.length < 5) || player.status === 'playing'}
                    >
                      XÉT
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Sidebar & Controls */}
      <div className="transaction-sidebar">
        <h3>📜 GIAO DỊCH</h3>
        <div className="log-list">
          {logs.map(log => (
            <div key={log.id} className="log-item">
              <span className={log.amount > 0 ? 'pos' : 'neg'}>{log.amount > 0 ? '+' : ''}{log.amount.toLocaleString()}</span>
              <p>{log.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bottom-controls">
        {gameState.dealer.id === profile?.id && (
          <button className="btn-main" onClick={startNewGame}>
            {gameState.status === 'ended' ? 'BẮT ĐẦU VÁN MỚI' : gameState.status === 'betting' ? 'CHIA BÀI' : 'RESET VÁN'}
          </button>
        )}
        {profile && <button className="btn-leave" onClick={leaveRole}>Rời bàn</button>}
      </div>

      {/* Thông báo Idle cho Nhà Cái */}
      {gameState.dealer.id !== '' && idleTimeLeft < 30 && (
        <div className="idle-timer">⚠️ Nhà Cái vắng mặt? Tự thoát sau {idleTimeLeft}s</div>
      )}

      {showAvatarPicker && profile && (
        <AvatarPicker
          userId={profile.id}
          currentAvatar={profile.avatar_url}
          onClose={() => setShowAvatarPicker(false)}
          onUpdate={(url) => {
            setProfile({ ...profile, avatar_url: url });
            setShowAvatarPicker(false);
          }}
        />
      )}
    </main>
  );
}
