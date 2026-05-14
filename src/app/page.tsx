'use client';

import React, { useState, useEffect } from 'react';
import { CardType, GameState, Player, GameStatus } from '../types/game';
import { createDeck, shuffle, calculateScore, checkSpecialHands } from '../lib/gameLogic';
import { Card } from '../components/Card';
import { supabase } from '../lib/supabase';
import { Auth } from '../components/Auth';

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
  
  const [gameState, setGameState] = useState<GameState>({
    deck: [],
    dealer: { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 10000000, currentBet: 0 },
    players: Array.from({ length: 10 }, (_, i) => ({
      id: '', name: `Vị trí ${i + 1}`, hand: [], score: 0, status: 'playing', isChecked: false, gameResult: null, balance: 0, currentBet: 0,
    })),
    status: 'ended',
    turnIndex: 0,
    lastActionAt: Date.now(),
  });

  // 1. Khởi tạo Session và Profile
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

  const fetchInitialData = (userId: string) => {
    fetchProfile(userId);
    fetchLogs(userId);
    subscribeToProfileChanges(userId);
  };

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
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
      (payload) => {
        setProfile(payload.new);
      }).subscribe();
  };

  // 2. Lịch sử giao dịch
  const fetchLogs = async (userId: string) => {
    const { data } = await supabase.from('transaction_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(15);
    if (data) setLogs(data);
  };

  const executeTransaction = async (userId: string, amount: number, type: string, description: string) => {
    const { data: currentProfile } = await supabase.from('profiles').select('balance').eq('id', userId).single();
    if (!currentProfile) return;
    const newBalance = currentProfile.balance + amount;
    await supabase.from('profiles').update({ balance: newBalance }).eq('id', userId);
    await supabase.from('transaction_logs').insert({ user_id: userId, amount, type, description });
    fetchLogs(userId);
  };

  // 3. Mã Cheat
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'p') setLastKeyPressed('p');
      else if (e.key === '0' && lastKeyPressed === 'p') {
        if (profile) await executeTransaction(profile.id, 100000, 'cheat', 'Mã Cheat (p+0)');
        setLastKeyPressed('');
      } else setLastKeyPressed('');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lastKeyPressed, profile]);

  // 4. Đồng bộ Game State
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

  // 5. Timer Logic (Player Turn & Idle Timeout)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      
      // Timer cho lượt chơi
      if (gameState.status === 'playing' && gameState.turnDeadline) {
        const diff = Math.max(0, Math.floor((gameState.turnDeadline! - now) / 1000));
        setTimeLeft(diff);
        const myPlayerIndex = gameState.players.findIndex(p => p.id === profile?.id);
        if (diff === 0 && gameState.turnIndex === myPlayerIndex) stand(gameState.turnIndex);
      } else {
        setTimeLeft(0);
      }

      // Timer cho Idle Timeout (1 phút không tạo ván)
      if (gameState.status === 'ended' && gameState.lastActionAt) {
        const idleDiff = Math.max(0, 60 - Math.floor((now - gameState.lastActionAt) / 1000));
        setIdleTimeLeft(idleDiff);
        
        // Nếu hết 1 phút idle, thực hiện reset bàn (kick tất cả thành quan sát)
        // Chỉ để người đang online đầu tiên thực hiện để tránh race condition (hoặc Dealer nếu còn)
        const isDealer = gameState.dealer.id === profile?.id;
        const firstOnlinePlayer = gameState.players.find(p => p.id !== '')?.id === profile?.id;
        
        if (idleDiff === 0 && (isDealer || firstOnlinePlayer || gameState.dealer.id === '')) {
          resetTableToEmpty();
        }
      } else {
        setIdleTimeLeft(60);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.turnIndex, gameState.turnDeadline, gameState.status, gameState.lastActionAt, profile]);

  const resetTableToEmpty = async () => {
    const emptyState: GameState = {
      deck: [],
      dealer: { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 },
      players: Array.from({ length: 10 }, (_, i) => ({
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
    if (nextIdx >= currentState.players.length) return { ...currentState, turnIndex: -1, turnDeadline: 0 };
    return { ...currentState, turnIndex: nextIdx, turnDeadline: Date.now() + 30000 };
  };

  const takeRole = (type: 'dealer' | 'player', index?: number) => {
    if (!profile) return;
    const alreadySeated = gameState.players.some(p => p.id === profile.id) || gameState.dealer.id === profile.id;
    if (alreadySeated) return alert("Bạn đã có vị trí rồi!");
    const newState = { ...gameState, lastActionAt: Date.now() };
    if (type === 'dealer') {
      newState.dealer = { ...newState.dealer, id: profile.id, name: `${profile.username} 👑`, balance: profile.balance };
    } else if (index !== undefined) {
      newState.players[index] = { ...newState.players[index], id: profile.id, name: profile.username, balance: profile.balance };
    }
    updateRemoteState(newState);
  };

  const leaveRole = async () => {
    if (!profile) return;
    const newState = { ...gameState, lastActionAt: Date.now() };
    const isGameActive = gameState.status === 'playing';

    if (newState.dealer.id === profile.id) {
      if (isGameActive) {
        newState.status = 'ended';
        newState.players.forEach(p => { p.hand = []; p.currentBet = 0; p.gameResult = null; p.isChecked = false; });
      }
      newState.dealer.id = '';
      newState.dealer.name = 'Nhà Cái';
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
        newState.players[pIdx] = { ...newState.players[pIdx], id: '', name: `Vị trí ${pIdx + 1}`, hand: [], score: 0, balance: 0, currentBet: 0 };
      }
    }
    updateRemoteState(newState);
  };

  const placeBet = async (index: number, amount: number) => {
    if (amount > profile.balance) return alert("Không đủ tiền!");
    const newState = { ...gameState, lastActionAt: Date.now() };
    newState.players[index].currentBet = amount;
    updateRemoteState(newState);
  };

  const startNewGame = () => {
    if (gameState.dealer.id !== profile.id) return alert("Chỉ Nhà Cái mới được bắt đầu!");
    if (gameState.status !== 'betting') {
      const newState = { ...gameState, status: 'betting' as GameStatus, lastActionAt: Date.now() };
      newState.players.forEach(p => { p.currentBet = 0; p.gameResult = null; p.isChecked = false; p.hand = []; p.status = 'playing'; });
      updateRemoteState(newState);
      return;
    }
    const playersInGame = gameState.players.filter(p => p.id !== '');
    if (playersInGame.length === 0) return alert("Cần ít nhất 1 người chơi để bắt đầu!");
    if (playersInGame.some(p => p.currentBet <= 0)) return alert("Còn người chưa cược!");

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
    const newStatus = newScore >= 28 ? 'bust' : (newScore > 21 ? 'bust' : (newHand.length === 5 ? 'ngu_linh' : 'playing'));
    if (newScore >= 28) {
      const otherPlayers = gameState.players.filter(p => p.id !== '' && p.id !== profile.id);
      const totalTableBet = otherPlayers.reduce((sum, p) => sum + p.currentBet, 0) + player.currentBet;
      executeTransaction(player.id, -totalTableBet, 'penalty', `ĐỀN NGUYÊN BÀN (Quắc ${newScore}đ)`);
      if (gameState.dealer.id) executeTransaction(gameState.dealer.id, totalTableBet, 'win', `Nhà Cái thu tiền đền nguyên bàn từ ${player.name}`);
      alert(`BẠN BỊ ĐỀN NGUYÊN BÀN! Mất tổng cộng $${totalTableBet.toLocaleString()} cho Nhà Cái.`);
      updatedPlayers[idx] = { ...player, hand: newHand, score: newScore, status: 'bust', isChecked: true };
    } else {
      updatedPlayers[idx] = { ...player, hand: newHand, score: newScore, status: newStatus };
    }
    let nextState = { ...gameState, deck: newDeck, players: updatedPlayers, lastActionAt: Date.now() };
    if (newStatus !== 'playing' || newScore >= 28) nextState = getNextTurnState(nextState);
    updateRemoteState(nextState);
  };

  const stand = (idx: number) => {
    if (gameState.turnIndex !== idx) return;
    const updatedPlayers = [...gameState.players];
    updatedPlayers[idx].status = 'stay';
    updateRemoteState(getNextTurnState({ ...gameState, players: updatedPlayers, lastActionAt: Date.now() }));
  };

  const checkPlayer = async (idx: number) => {
    if (gameState.dealer.id !== profile.id) return;
    const dealerScore = calculateScore(gameState.dealer.hand);
    if (dealerScore < 15) return alert("Nhà Cái phải đủ ít nhất 15 điểm mới được quyền XÉT!");
    const updatedPlayers = [...gameState.players];
    const player = updatedPlayers[idx];
    const bet = player.currentBet;
    let multiplier = 1;
    const playerSpecial = checkSpecialHands(player);
    const dealerSpecial = checkSpecialHands(gameState.dealer);
    let result: 'win' | 'lose' | 'draw' = 'draw';
    if (playerSpecial === 'xi_bang' || playerSpecial === 'xi_dach') {
      if (dealerSpecial === playerSpecial) result = 'draw';
      else { result = 'win'; if (playerSpecial === 'xi_bang') multiplier = 4; else if (playerSpecial === 'xi_dach') multiplier = 3; }
    } else if (dealerSpecial === 'xi_bang' || dealerSpecial === 'xi_dach') { result = 'lose'; }
    else if (player.status === 'bust') { result = 'lose'; }
    else if (playerSpecial === 'ngu_linh') { if (dealerSpecial === 'ngu_linh') result = 'draw'; else { result = 'win'; multiplier = 2; } }
    else if (dealerScore > 21) { result = 'win'; }
    else if (dealerScore > player.score) { result = 'lose'; }
    else if (dealerScore < player.score) { result = 'win'; }
    else { result = 'draw'; }

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
    if (gameState.dealer.id !== profile.id) return;
    if (gameState.players.some(p => p.isChecked)) return alert("Đã xét bài, không thể rút thêm!");
    const newDeck = [...gameState.deck];
    const newCard = newDeck.pop()!;
    const newHand = [...gameState.dealer.hand, newCard];
    const newScore = calculateScore(newHand);
    updateRemoteState({ ...gameState, deck: newDeck, dealer: { ...gameState.dealer, hand: newHand, score: newScore }, lastActionAt: Date.now() });
  };

  if (!session) return <Auth onSession={setSession} />;

  return (
    <main>
      {/* Thông báo Idle Timeout */}
      {gameState.status === 'ended' && gameState.players.some(p => p.id !== '') && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(231, 76, 60, 0.9)', color: 'white', padding: '10px 20px',
          borderRadius: '30px', zIndex: 1000, fontSize: '0.9rem', fontWeight: 'bold',
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)', border: '2px solid white'
        }}>
          ⚠️ Bàn sẽ Reset sau {idleTimeLeft}s nếu không bắt đầu ván mới!
        </div>
      )}

      <div className="transaction-sidebar" style={{
        position: 'fixed', left: '20px', top: '100px', width: '250px',
        background: 'rgba(0,0,0,0.8)', borderRadius: '15px', padding: '15px',
        border: '1px solid var(--gold)', zIndex: 100, backdropFilter: 'blur(10px)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <h3 style={{ color: 'var(--gold)', marginBottom: '10px', fontSize: '0.9rem', textAlign: 'center', borderBottom: '1px solid var(--gold)', paddingBottom: '5px' }}>📜 LỊCH SỬ GIAO DỊCH</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '450px', overflowY: 'auto', paddingRight: '5px' }}>
          {logs.map(log => (
            <div key={log.id} style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ color: log.amount > 0 ? '#2ecc71' : '#e74c3c', fontWeight: 'bold', fontSize: '0.85rem' }}>
                  {log.amount > 0 ? '+' : ''}{log.amount.toLocaleString()}
                </span>
                <span style={{ opacity: 0.4, fontSize: '0.65rem' }}>{new Date(log.created_at).toLocaleTimeString()}</span>
              </div>
              <div style={{ opacity: 0.9, color: '#ddd' }}>{log.description}</div>
            </div>
          ))}
          {logs.length === 0 && <div style={{ opacity: 0.5, fontSize: '0.75rem', textAlign: 'center', marginTop: '20px' }}>Chưa có giao dịch...</div>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '1200px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h1>XÌ DÁCH CASINO</h1>
          {profile && (
            <div className="balance-tag" style={{ fontSize: '1.2rem', background: 'rgba(0,0,0,0.5)', padding: '5px 15px', borderRadius: '20px', border: '1px solid #2ecc71' }}>
              💰 ${profile.balance.toLocaleString()}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ background: 'var(--gold)', color: 'black', padding: '5px 15px', borderRadius: '10px', fontWeight: 'bold', boxShadow: '0 0 10px rgba(212,175,55,0.5)' }}> {profile?.username} </div>
          <button className="btn-xet" style={{ background: '#e63946', color: 'white' }} onClick={() => supabase.auth.signOut()}>Đăng xuất</button>
        </div>
      </div>
      
      <div className="table-area"></div>

      <div className="dealer-section">
        <div className="score-badge">
          {gameState.dealer.name} - ${gameState.dealer.balance.toLocaleString()} 
          {gameState.turnIndex === -1 && gameState.status === 'playing' && <span style={{ color: 'var(--gold)', marginLeft: '10px', animation: 'blink 1s infinite' }}>[LƯỢT NHÀ CÁI]</span>}
        </div>
          <div className="hand">
            {gameState.dealer.hand.map((card, i) => {
              const isMeChecked = gameState.players.some(p => p.id === profile?.id && p.isChecked);
              const isVisible = gameState.dealer.id === profile?.id || gameState.status === 'ended' || isMeChecked;
              return <Card key={i} card={isVisible ? card : { ...card, isRevealed: false }} index={i} />;
            })}
          </div>
          {gameState.dealer.hand.length > 0 && (gameState.dealer.id === profile?.id || gameState.status === 'ended' || gameState.players.some(p => p.id === profile?.id && p.isChecked)) && (
            <div className="score-pill" style={{
              background: 'rgba(212,175,55,0.2)', color: 'var(--gold)', padding: '2px 10px',
              borderRadius: '10px', fontSize: '0.7rem', marginTop: '5px', border: '1px solid var(--gold)',
              display: 'inline-block', fontWeight: 'bold'
            }}>
              {(() => {
                const special = checkSpecialHands(gameState.dealer);
                if (special === 'xi_bang') return 'XÌ BÀNG 🔥';
                if (special === 'xi_dach') return 'XÌ DÁCH 🃏';
                const score = calculateScore(gameState.dealer.hand);
                return score > 21 ? `QUẮC (${score})` : `${score} NÚT`;
              })()}
            </div>
          )}
          {gameState.dealer.id === '' ? (
            !(gameState.players.some(p => p.id === profile?.id) || gameState.dealer.id === profile?.id) && 
            <button className="btn btn-gold" style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem' }} onClick={() => takeRole('dealer')}>Làm Cái 👑</button>
          ) : gameState.dealer.id === profile?.id && (
            <div className="controls" style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
              {gameState.status === 'playing' && gameState.turnIndex === -1 && <button className="btn-xet" onClick={dealerHit}>Rút bài Cái</button>}
              <button 
                className="btn-xet" 
                style={{ background: '#e67e22', color: 'white', border: '1px solid #d35400' }} 
                onClick={resetTableToEmpty}
              >
                🔄 Làm mới toàn bàn (Kick hết)
              </button>
            </div>
          )}
      </div>

      <div className="players-grid">
        {gameState.players.map((player, idx) => (
            <div key={idx} className={`player-box seat-${idx} ${player.id === profile?.id ? 'active' : ''} ${gameState.turnIndex === idx ? 'highlight-turn' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: player.id ? 'var(--gold)' : '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }}>
                  {player.name}
                </div>
                {gameState.turnIndex === idx && <div style={{ color: '#ff4757', fontWeight: 'bold', fontSize: '0.75rem' }}>{timeLeft}s</div>}
              </div>
              {player.id !== '' && <div className="balance-tag" style={{ color: '#2ecc71', fontSize: '0.7rem', marginTop: '-2px' }}>${player.balance.toLocaleString()}</div>}
              <div className="hand">
                {player.hand.length > 0 ? player.hand.map((card, i) => {
                  const isVisible = player.id === profile?.id || player.isChecked || gameState.status === 'ended';
                  return <Card key={i} card={isVisible ? card : { ...card, isRevealed: false }} index={i} />;
                }) : player.id !== '' ? <div style={{ fontSize: '0.65rem', opacity: 0.5, textAlign: 'center', width: '100%' }}>{gameState.status === 'betting' ? '⌛ Cược...' : '💤 Chờ ván...'}</div> : null}
              </div>
              {player.hand.length > 0 && (player.id === profile?.id || player.isChecked || gameState.status === 'ended') && (
                <div className="score-pill" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', marginTop: '5px', border: '1px solid rgba(255,255,255,0.2)', display: 'inline-block' }}>
                  {(() => {
                    const special = checkSpecialHands(player);
                    if (special === 'xi_bang') return 'XÌ BÀNG 🔥';
                    if (special === 'xi_dach') return 'XÌ DÁCH 🃏';
                    if (special === 'ngu_linh') return 'NGŨ LINH ✨';
                    const score = calculateScore(player.hand);
                    return score > 21 ? `QUẮC (${score})` : `${score} NÚT`;
                  })()}
                </div>
              )}
              {player.id === '' ? (
                !(gameState.players.some(p => p.id === profile?.id) || gameState.dealer.id === profile?.id) && 
                (gameState.status !== 'playing' ? <button className="btn-xet" onClick={() => takeRole('player', idx)}>Ngồi đây</button> : <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>Trong ván...</div>)
              ) : (
                <>
                  {player.currentBet > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 'bold' }}>💸 Cược: ${player.currentBet.toLocaleString()}</div>}
                  {player.gameResult && <div className={`status-tag status-${player.gameResult}`} style={{ marginTop: '5px' }}>{player.gameResult}</div>}
                  {player.id === profile?.id && (
                    <div style={{ marginTop: '5px' }}>
                      {gameState.status === 'betting' ? (
                        <input type="number" className="bet-input" placeholder="Nhập cược" onBlur={(e) => placeBet(idx, parseInt(e.target.value))} />
                      ) : gameState.turnIndex === idx ? (
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button className="btn-xet" style={{ background: '#2ecc71' }} onClick={() => hit(idx)}>Rút</button>
                          <button className="btn-xet" style={{ background: '#f1c40f' }} onClick={() => stand(idx)}>Dừng</button>
                        </div>
                      ) : player.hand.length > 0 && <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '5px' }}>{player.status === 'stay' ? '✅ Đã dừng' : '⏳ Chờ lượt...'}</div>}
                    </div>
                  )}
                  {gameState.dealer.id === profile?.id && player.hand.length > 0 && !player.isChecked && (
                    <button className="btn-xet" style={{ background: (calculateScore(gameState.dealer.hand) >= 15 && player.status !== 'playing') ? '#ff4757' : '#555', color: 'white', fontWeight: 'bold' }} onClick={() => checkPlayer(idx)} disabled={calculateScore(gameState.dealer.hand) < 15 || player.status === 'playing'}>
                      XÉT {player.status === 'playing' ? '(Đang chờ...)' : (calculateScore(gameState.dealer.hand) < 15 ? '(Cần 15đ)' : '')}
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
      </div>
      <div className="controls">
        {gameState.dealer.id === profile?.id && (
          <button className="btn btn-gold" onClick={startNewGame}>
            {gameState.status === 'ended' ? 'Mở bàn đặt cược' : gameState.status === 'betting' ? 'Chia bài' : 'Bắt đầu mới'}
          </button>
        )}
        {profile && <button className="btn-xet" style={{ marginLeft: '10px', background: 'rgba(255,255,255,0.1)', color: '#aaa' }} onClick={leaveRole}>Rời chỗ</button>}
      </div>
    </main>
  );
}
