'use client';

import React, { useState, useEffect } from 'react';
import { CardType, GameState, Player, GameStatus } from '../types/game';
import { createDeck, shuffle, calculateScore } from '../lib/gameLogic';
import { Card } from '../components/Card';
import { supabase } from '../lib/supabase';

const ROOM_ID = 'gameo-table-1';

export default function GameDashboard() {
  const [myId, setMyId] = useState<string>('');
  const [myName, setMyName] = useState<string>('');
  const [gameState, setGameState] = useState<GameState>({
    deck: [],
    dealer: { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 1000000, currentBet: 0 },
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

  // 1. Khởi tạo ID và Realtime
  useEffect(() => {
    let localId = localStorage.getItem('gameo_player_id');
    let localName = localStorage.getItem('gameo_player_name');
    if (!localId) {
      localId = 'player_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('gameo_player_id', localId);
    }
    setMyId(localId);
    if (localName) setMyName(localName);

    const fetchGame = async () => {
      const { data } = await supabase.from('game_rooms').select('game_state').eq('id', ROOM_ID).single();
      if (data) setGameState(data.game_state);
      else await supabase.from('game_rooms').insert([{ id: ROOM_ID, game_state: gameState }]);
    };
    fetchGame();

    const channel = supabase.channel('room-1').on('postgres_changes', 
      { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${ROOM_ID}` },
      (payload) => setGameState(payload.new.game_state)
    ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateRemoteState = async (newState: GameState) => {
    setGameState(newState);
    await supabase.from('game_rooms').update({ game_state: newState }).eq('id', ROOM_ID);
  };

  // Vòng quay tiền khởi đầu
  const runMoneySpinner = (index: number) => {
    setTimeout(() => {
      const randomMoney = (Math.floor(Math.random() * 5) + 1) * 1000;
      setGameState(prev => {
        const newState = { ...prev };
        newState.players[index].balance = randomMoney;
        newState.players[index].isSpinning = false;
        updateRemoteState(newState);
        return newState;
      });
    }, 2000);
  };

  const takeRole = (type: 'dealer' | 'player', index?: number) => {
    const name = prompt("Nhập tên của bạn:", myName || "Người chơi mới");
    if (!name) return;
    setMyName(name);
    localStorage.setItem('gameo_player_name', name);

    const newState = { ...gameState };
    if (type === 'dealer') {
      newState.dealer.id = myId;
      newState.dealer.name = `${name} 👑`;
    } else if (index !== undefined) {
      newState.players[index].id = myId;
      newState.players[index].name = name;
      newState.players[index].isSpinning = true;
      runMoneySpinner(index);
    }
    updateRemoteState(newState);
  };

  const leaveRole = () => {
    const newState = { ...gameState };
    if (newState.dealer.id === myId) {
      newState.dealer.id = '';
      newState.dealer.name = 'Nhà Cái';
    }
    newState.players.forEach((p, i) => {
      if (p.id === myId) {
        p.id = '';
        p.name = `Vị trí ${i + 1}`;
        p.hand = [];
        p.score = 0;
        p.balance = 0;
      }
    });
    updateRemoteState(newState);
  };

  // Logic Đặt cược
  const placeBet = (index: number, amount: number) => {
    const newState = { ...gameState };
    if (amount > newState.players[index].balance) return alert("Không đủ tiền cược!");
    newState.players[index].currentBet = amount;
    updateRemoteState(newState);
  };

  const startNewGame = () => {
    if (gameState.dealer.id !== myId) return alert("Chỉ Nhà Cái mới được bắt đầu!");
    
    // Chuyển sang giai đoạn đặt cược
    if (gameState.status !== 'betting') {
      const newState = { ...gameState, status: 'betting' as GameStatus };
      // Reset cược cũ
      newState.players.forEach(p => { p.currentBet = 0; p.gameResult = null; p.isChecked = false; p.hand = []; });
      updateRemoteState(newState);
      return;
    }

    // Nếu đã ở giai đoạn cược, bắt đầu chia bài
    const playersInGame = gameState.players.filter(p => p.id !== '');
    if (playersInGame.some(p => p.currentBet <= 0)) return alert("Vẫn còn người chưa đặt cược!");

    let newDeck = shuffle(createDeck());
    const dealerHand = [newDeck.pop()!, { ...newDeck.pop()!, isRevealed: false }];
    const updatedPlayers = gameState.players.map(p => {
      if (p.id === '') return p;
      const hand = [newDeck.pop()!, newDeck.pop()!];
      return { ...p, hand: hand as CardType[], score: calculateScore(hand as CardType[]), status: 'playing' as any };
    });

    const firstPlayerIndex = updatedPlayers.findIndex(p => p.id !== '');
    updateRemoteState({ 
      ...gameState, 
      deck: newDeck, 
      dealer: { ...gameState.dealer, hand: dealerHand as CardType[], score: calculateScore(dealerHand as CardType[]), status: 'playing' }, 
      players: updatedPlayers, 
      status: 'playing',
      turnIndex: firstPlayerIndex !== -1 ? firstPlayerIndex : 0
    });
  };

  const isDealer = gameState.dealer.id === myId;
  const myPlayerIndex = gameState.players.findIndex(p => p.id === myId);
  const isMyTurn = gameState.turnIndex === myPlayerIndex && gameState.status === 'playing';

  const nextTurn = (currentState: GameState) => {
    let nextIdx = currentState.turnIndex + 1;
    while (nextIdx < currentState.players.length && currentState.players[nextIdx].id === '') nextIdx++;
    return { ...currentState, turnIndex: nextIdx };
  };

  const hit = (idx: number) => {
    if (!isMyTurn) return;
    const newDeck = [...gameState.deck];
    const newCard = newDeck.pop()!;
    const updatedPlayers = [...gameState.players];
    const player = updatedPlayers[idx];
    const newHand = [...player.hand, newCard];
    const newScore = calculateScore(newHand);
    const newStatus = newScore > 21 ? 'bust' : (newHand.length === 5 ? 'ngu_linh' : 'playing');
    updatedPlayers[idx] = { ...player, hand: newHand, score: newScore, status: newStatus };
    let nextState = { ...gameState, deck: newDeck, players: updatedPlayers };
    if (newStatus !== 'playing') nextState = nextTurn(nextState);
    updateRemoteState(nextState);
  };

  const stand = (idx: number) => {
    if (!isMyTurn) return;
    const updatedPlayers = [...gameState.players];
    updatedPlayers[idx].status = 'stay';
    updateRemoteState(nextTurn({ ...gameState, players: updatedPlayers }));
  };

  const checkPlayer = (idx: number) => {
    if (!isDealer) return;
    const dealerScore = calculateScore(gameState.dealer.hand.map(c => ({ ...c, isRevealed: true })));
    const updatedPlayers = [...gameState.players];
    const player = updatedPlayers[idx];
    
    let result: 'win' | 'lose' | 'draw' = 'draw';
    if (player.status === 'bust') result = 'lose';
    else if (dealerScore > 21) result = 'win';
    else if (dealerScore > player.score) result = 'lose';
    else if (dealerScore < player.score) result = 'win';
    else result = 'draw';

    // Cập nhật tiền
    if (result === 'win') player.balance += player.currentBet;
    else if (result === 'lose') player.balance -= player.currentBet;

    updatedPlayers[idx] = { ...player, isChecked: true, gameResult: result };
    updateRemoteState({ ...gameState, players: updatedPlayers });
  };

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '1200px', alignItems: 'center' }}>
        <h1>XÌ DÁCH CASINO</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ background: 'var(--gold)', color: 'black', padding: '5px 15px', borderRadius: '10px', fontWeight: 'bold' }}>
            {isDealer ? 'NHÀ CÁI 👑' : myPlayerIndex !== -1 ? `${gameState.players[myPlayerIndex].name} 👤` : 'CHƯA CHỌN CHỖ'}
          </div>
          {(isDealer || myPlayerIndex !== -1) && <button className="btn-xet" style={{ background: '#e63946', color: 'white' }} onClick={leaveRole}>Rời chỗ</button>}
        </div>
      </div>
      
      <div className="table-area">
        <div className="dealer-section">
          <div className="score-badge">{gameState.dealer.name}</div>
          <div className="hand">{gameState.dealer.hand.map((card, i) => <Card key={i} card={card} index={i} />)}</div>
          {gameState.dealer.id === '' ? <button className="btn-xet" onClick={() => takeRole('dealer')}>Làm Cái 👑</button> : isDealer && (
            <div className="controls" style={{ marginTop: '10px' }}>
              <button className="btn-xet" onClick={() => updateRemoteState({...gameState, dealer: {...gameState.dealer, hand: [...gameState.dealer.hand, gameState.deck.pop()!]}})}>Rút bài Cái</button>
              <button className="btn-xet" style={{ marginLeft: '10px' }} onClick={() => updateRemoteState({...gameState, dealer: {...gameState.dealer, hand: gameState.dealer.hand.map(c => ({...c, isRevealed: true}))}})}>Mở bài Cái</button>
            </div>
          )}
        </div>

        <div className="players-grid">
          {gameState.players.map((player, idx) => (
            <div key={idx} className={`player-box ${player.id === myId ? 'active' : ''} ${gameState.turnIndex === idx ? 'highlight-turn' : ''}`}>
              {player.isSpinning && (
                <div className="spinner-overlay">
                  <div className="spinner-box">$$$</div>
                  <div style={{ marginTop: '10px', color: 'var(--gold)' }}>Đang quay tiền...</div>
                </div>
              )}
              
              <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{player.name}</div>
              {player.id !== '' && <div className="balance-tag">${player.balance}</div>}

              <div className="hand">
                {player.hand.length > 0 ? player.hand.map((card, i) => <Card key={i} card={card} index={i} />) : player.id !== '' ? <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>{gameState.status === 'betting' ? 'Đang đặt cược...' : 'Đợi ván sau...'}</div> : null}
              </div>

              {player.id === '' ? (
                gameState.status !== 'playing' ? <button className="btn-xet" onClick={() => takeRole('player', idx)}>Ngồi đây</button> : <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>Trong ván...</div>
              ) : (
                <>
                  {player.currentBet > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>Cược: ${player.currentBet}</div>}
                  {player.gameResult && <div className={`status-tag status-${player.gameResult}`}>{player.gameResult}</div>}
                  
                  {player.id === myId && (
                    <div style={{ marginTop: '5px' }}>
                      {gameState.status === 'betting' ? (
                        <input type="number" className="bet-input" placeholder="Tiền cược" onBlur={(e) => placeBet(idx, parseInt(e.target.value))} />
                      ) : isMyTurn ? (
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button className="btn-xet" onClick={() => hit(idx)}>Rút</button>
                          <button className="btn-xet" onClick={() => stand(idx)}>Dừng</button>
                        </div>
                      ) : <div style={{ fontSize: '0.6rem', color: 'var(--gold)' }}>Đợi...</div>}
                    </div>
                  )}
                  
                  {isDealer && player.hand.length > 0 && (player.status === 'stay' || player.status === 'bust') && !player.isChecked && (
                    <button className="btn-xet" style={{ background: 'red', color: 'white' }} onClick={() => checkPlayer(idx)}>XÉT</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="controls">
        <button className="btn btn-gold" onClick={startNewGame} disabled={!isDealer}>
          {gameState.status === 'ended' ? 'Mở bàn đặt cược' : gameState.status === 'betting' ? 'Chia bài' : 'Bắt đầu mới'}
        </button>
      </div>
    </main>
  );
}
