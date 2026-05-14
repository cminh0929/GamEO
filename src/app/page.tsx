'use client';

import React, { useState, useEffect } from 'react';
import { CardType, GameState, Player, GameStatus } from '../types/game';
import { createDeck, shuffle, calculateScore } from '../lib/gameLogic';
import { Card } from '../components/Card';
import { supabase } from '../lib/supabase';
import { Auth } from '../components/Auth';

const ROOM_ID = 'gameo-table-1';
export const dynamic = 'force-dynamic';

export default function GameDashboard() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  
  const [gameState, setGameState] = useState<GameState>({
    deck: [],
    dealer: { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 10000000, currentBet: 0 },
    players: Array.from({ length: 10 }, (_, i) => ({
      id: '',
      name: `Vị trí ${i + 1}`,
      hand: [],
      score: 0,
      status: 'playing',
      isChecked: false,
      gameResult: null,
      balance: 0,
      currentBet: 0,
    })),
    status: 'ended',
    turnIndex: 0,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setProfile(data);
  };

  useEffect(() => {
    let active = true;
    const fetchGame = async () => {
      const { data } = await supabase.from('game_rooms').select('game_state').eq('id', ROOM_ID).single();
      if (active && data) setGameState(data.game_state);
    };
    fetchGame();

    const channel = supabase.channel('room-1').on('postgres_changes', 
      { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${ROOM_ID}` },
      (payload) => setGameState(payload.new.game_state)
    ).subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (gameState.status !== 'playing' || !gameState.turnDeadline) {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((gameState.turnDeadline! - now) / 1000));
      setTimeLeft(diff);

      const myPlayerIndex = gameState.players.findIndex(p => p.id === profile?.id);
      if (diff === 0 && gameState.turnIndex === myPlayerIndex) {
        stand(gameState.turnIndex);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState.turnIndex, gameState.turnDeadline, gameState.status, profile]);

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

  const takeRole = (type: 'dealer' | 'player', index?: number) => {
    if (!profile) return;
    const alreadySeated = gameState.players.some(p => p.id === profile.id) || gameState.dealer.id === profile.id;
    if (alreadySeated) return alert("Bạn đã có vị trí rồi!");
    const newState = { ...gameState };
    if (type === 'dealer') {
      newState.dealer.id = profile.id;
      newState.dealer.name = `${profile.username} 👑`;
      newState.dealer.balance = profile.balance;
    } else if (index !== undefined) {
      newState.players[index].id = profile.id;
      newState.players[index].name = profile.username;
      newState.players[index].balance = profile.balance;
    }
    updateRemoteState(newState);
  };

  const leaveRole = async () => {
    if (!profile) return;
    const newState = { ...gameState };
    const isGameActive = gameState.status === 'playing';

    if (newState.dealer.id === profile.id) {
      // TRƯỜNG HỢP: Nhà cái thoát bàn
      if (isGameActive) {
        alert("Nhà cái thoát ván bài! Ván đấu bị hủy bỏ.");
        // Hủy ván bài, không ai mất tiền, reset trạng thái
        newState.status = 'ended';
        newState.players.forEach(p => { p.hand = []; p.currentBet = 0; p.gameResult = null; p.isChecked = false; });
      }
      newState.dealer.id = '';
      newState.dealer.name = 'Nhà Cái';
    } else {
      // TRƯỜNG HỢP: Người chơi thoát bàn
      const pIdx = newState.players.findIndex(p => p.id === profile.id);
      if (pIdx !== -1) {
        const player = newState.players[pIdx];
        if (isGameActive && player.hand.length > 0 && !player.isChecked) {
          // Xử phạt: Nhà cái hưởng số tiền cược của người chơi này
          const bet = player.currentBet;
          const newPlayerBalance = player.balance - bet;
          const newDealerBalance = newState.dealer.balance + bet;

          // Cập nhật DB
          await supabase.from('profiles').update({ balance: newPlayerBalance }).eq('id', player.id);
          if (newState.dealer.id) {
            await supabase.from('profiles').update({ balance: newDealerBalance }).eq('id', newState.dealer.id);
          }

          newState.dealer.balance = newDealerBalance;
          alert(`Bạn đã thoát ván bài! Nhà cái hưởng tiền cược: $${bet.toLocaleString()}`);
        }
        
        newState.players[pIdx].id = '';
        newState.players[pIdx].name = `Vị trí ${pIdx + 1}`;
        newState.players[pIdx].hand = [];
        newState.players[pIdx].score = 0;
        newState.players[pIdx].balance = 0;
        newState.players[pIdx].currentBet = 0;
      }
    }
    updateRemoteState(newState);
  };

  const placeBet = (index: number, amount: number) => {
    const newState = { ...gameState };
    if (amount > profile.balance) return alert("Không đủ tiền!");
    newState.players[index].currentBet = amount;
    updateRemoteState(newState);
  };

  const startNewGame = () => {
    if (gameState.dealer.id !== profile.id) return alert("Chỉ Nhà Cái mới được bắt đầu!");
    if (gameState.status !== 'betting') {
      const newState = { ...gameState, status: 'betting' as GameStatus };
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
      ...gameState, 
      deck: newDeck, 
      dealer: { ...gameState.dealer, hand: dealerHand as CardType[], score: calculateScore(dealerHand as CardType[]), status: 'playing' }, 
      players: updatedPlayers, 
      status: 'playing',
      turnIndex: firstPlayerIndex !== -1 ? firstPlayerIndex : 0,
      turnDeadline: Date.now() + 30000
    });
  };

  const hit = (idx: number) => {
    if (gameState.turnIndex !== idx) return;
    const newDeck = [...gameState.deck];
    const newCard = newDeck.pop()!;
    const updatedPlayers = [...gameState.players];
    const player = updatedPlayers[idx];
    const newHand = [...player.hand, newCard];
    const newScore = calculateScore(newHand);
    const newStatus = newScore > 21 ? 'bust' : (newHand.length === 5 ? 'ngu_linh' : 'playing');
    updatedPlayers[idx] = { ...player, hand: newHand, score: newScore, status: newStatus };
    
    let nextState = { ...gameState, deck: newDeck, players: updatedPlayers };
    if (newStatus !== 'playing') {
      nextState = getNextTurnState(nextState);
    }
    updateRemoteState(nextState);
  };

  const stand = (idx: number) => {
    if (gameState.turnIndex !== idx) return;
    const updatedPlayers = [...gameState.players];
    updatedPlayers[idx].status = 'stay';
    updateRemoteState(getNextTurnState({ ...gameState, players: updatedPlayers }));
  };

  const checkPlayer = async (idx: number) => {
    if (gameState.dealer.id !== profile.id) return;
    const dealerScore = calculateScore(gameState.dealer.hand);
    if (dealerScore < 15) return alert("Nhà Cái phải đủ ít nhất 15 điểm mới được quyền XÉT!");

    const updatedPlayers = [...gameState.players];
    const player = updatedPlayers[idx];
    const bet = player.currentBet;
    
    let result: 'win' | 'lose' | 'draw' = 'draw';
    if (player.status === 'bust') result = 'lose';
    else if (dealerScore > 21) result = 'win';
    else if (dealerScore > player.score) result = 'lose';
    else if (dealerScore < player.score) result = 'win';
    else result = 'draw';

    let newPlayerBalance = player.balance;
    let newDealerBalance = gameState.dealer.balance;

    if (result === 'win') { newPlayerBalance += bet; newDealerBalance -= bet; }
    else if (result === 'lose') { newPlayerBalance -= bet; newDealerBalance += bet; }

    await supabase.from('profiles').update({ balance: newPlayerBalance }).eq('id', player.id);
    await supabase.from('profiles').update({ balance: newDealerBalance }).eq('id', gameState.dealer.id);

    updatedPlayers[idx] = { ...player, balance: newPlayerBalance, isChecked: true, gameResult: result };
    updateRemoteState({ 
      ...gameState, 
      players: updatedPlayers, 
      dealer: { ...gameState.dealer, balance: newDealerBalance } 
    });
  };

  const dealerHit = () => {
    if (gameState.dealer.id !== profile.id) return;
    const newDeck = [...gameState.deck];
    const newCard = newDeck.pop()!;
    const newHand = [...gameState.dealer.hand, newCard];
    const newScore = calculateScore(newHand);
    updateRemoteState({ ...gameState, deck: newDeck, dealer: { ...gameState.dealer, hand: newHand, score: newScore } });
  };

  if (!session) return <Auth onSession={setSession} />;

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '1200px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h1>XÌ DÁCH CASINO</h1>
          {profile && (
            <div className="balance-tag" style={{ fontSize: '1.2rem', background: 'rgba(0,0,0,0.5)', padding: '5px 15px', borderRadius: '20px' }}>
              💰 ${profile.balance.toLocaleString()}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ background: 'var(--gold)', color: 'black', padding: '5px 15px', borderRadius: '10px', fontWeight: 'bold' }}>
             {profile?.username}
          </div>
          <button className="btn-xet" style={{ background: '#e63946', color: 'white' }} onClick={() => supabase.auth.signOut()}>Đăng xuất</button>
        </div>
      </div>
      
      <div className="table-area">
        <div className="dealer-section">
          <div className="score-badge">
            {gameState.dealer.name} - ${gameState.dealer.balance.toLocaleString()} 
            {gameState.turnIndex === -1 && gameState.status === 'playing' && <span style={{ color: 'var(--gold)', marginLeft: '10px' }}>[LƯỢT NHÀ CÁI]</span>}
          </div>
          <div className="hand">
            {gameState.dealer.hand.map((card, i) => {
              const isVisible = gameState.dealer.id === profile?.id || gameState.status === 'ended';
              return <Card key={i} card={isVisible ? card : { ...card, isRevealed: false }} index={i} />;
            })}
          </div>
          {gameState.dealer.id === '' ? (
            !(gameState.players.some(p => p.id === profile?.id) || gameState.dealer.id === profile?.id) && 
            <button className="btn-xet" onClick={() => takeRole('dealer')}>Làm Cái 👑</button>
          ) : gameState.dealer.id === profile?.id && (
            <div className="controls" style={{ marginTop: '10px' }}>
              {gameState.status === 'playing' && gameState.turnIndex === -1 && <button className="btn-xet" onClick={dealerHit}>Rút bài Cái</button>}
              <button className="btn-xet" style={{ marginLeft: '10px' }} onClick={() => updateRemoteState({...gameState, status: 'ended'})}>Kết thúc ván</button>
            </div>
          )}
        </div>

        <div className="players-grid">
          {gameState.players.map((player, idx) => (
            <div key={idx} className={`player-box ${player.id === profile?.id ? 'active' : ''} ${gameState.turnIndex === idx ? 'highlight-turn' : ''}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{player.name}</div>
                {gameState.turnIndex === idx && <div style={{ color: 'red', fontWeight: 'bold' }}>{timeLeft}s</div>}
              </div>
              
              {player.id !== '' && <div className="balance-tag">${player.balance.toLocaleString()}</div>}

              <div className="hand">
                {player.hand.length > 0 ? player.hand.map((card, i) => {
                  const isVisible = player.id === profile?.id || player.isChecked || gameState.status === 'ended';
                  return <Card key={i} card={isVisible ? card : { ...card, isRevealed: false }} index={i} />;
                }) : player.id !== '' ? <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>{gameState.status === 'betting' ? 'Đang đặt cược...' : 'Đợi ván sau...'}</div> : null}
              </div>

              {player.id === '' ? (
                !(gameState.players.some(p => p.id === profile?.id) || gameState.dealer.id === profile?.id) && 
                (gameState.status !== 'playing' ? <button className="btn-xet" onClick={() => takeRole('player', idx)}>Ngồi đây</button> : <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>Trong ván...</div>)
              ) : (
                <>
                  {player.currentBet > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>Cược: ${player.currentBet.toLocaleString()}</div>}
                  {player.gameResult && <div className={`status-tag status-${player.gameResult}`}>{player.gameResult}</div>}
                  
                  {player.id === profile?.id && (
                    <div style={{ marginTop: '5px' }}>
                      {gameState.status === 'betting' ? (
                        <input type="number" className="bet-input" placeholder="Cược" onBlur={(e) => placeBet(idx, parseInt(e.target.value))} />
                      ) : gameState.turnIndex === idx ? (
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button className="btn-xet" onClick={() => hit(idx)}>Rút</button>
                          <button className="btn-xet" onClick={() => stand(idx)}>Dừng</button>
                        </div>
                      ) : player.hand.length > 0 && <div style={{ fontSize: '0.6rem', color: 'var(--gold)' }}>{player.status === 'stay' ? 'Đã dừng' : 'Đợi...'}</div>}
                    </div>
                  )}
                  
                  {gameState.dealer.id === profile?.id && player.hand.length > 0 && !player.isChecked && (
                    <button 
                      className="btn-xet" 
                      style={{ background: calculateScore(gameState.dealer.hand) >= 15 ? 'red' : '#555', color: 'white', cursor: calculateScore(gameState.dealer.hand) >= 15 ? 'pointer' : 'not-allowed' }} 
                      onClick={() => checkPlayer(idx)}
                      disabled={calculateScore(gameState.dealer.hand) < 15}
                    >
                      XÉT {calculateScore(gameState.dealer.hand) < 15 && '(Cần 15đ)'}
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="controls">
        {gameState.dealer.id === profile?.id && (
          <button className="btn btn-gold" onClick={startNewGame}>
            {gameState.status === 'ended' ? 'Mở bàn đặt cược' : gameState.status === 'betting' ? 'Chia bài' : 'Bắt đầu mới'}
          </button>
        )}
        {profile && <button className="btn-xet" style={{ marginLeft: '10px' }} onClick={leaveRole}>Rời chỗ</button>}
      </div>
    </main>
  );
}
