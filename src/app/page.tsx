'use client';

import React, { useState, useEffect } from 'react';
import { CardType, GameState, Player, GameStatus } from '../types/game';
import { createDeck, shuffle, calculateScore } from '../lib/gameLogic';
import { Card } from '../components/Card';
import { supabase } from '../lib/supabase';

const ROOM_ID = 'gameo-table-1';

export default function GameDashboard() {
  const [myId, setMyId] = useState<string>('');
  const [gameState, setGameState] = useState<GameState>({
    deck: [],
    dealer: { id: 'dealer', name: 'Nhà Cái', hand: [], score: 0, status: 'playing' },
    players: Array.from({ length: 10 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Người chơi ${i + 1}`,
      hand: [],
      score: 0,
      status: 'playing',
      isChecked: false,
      gameResult: null,
    })),
    status: 'ended',
    turnIndex: 0,
  });

  // 1. Khởi tạo ID người chơi và Realtime
  useEffect(() => {
    // Định danh trình duyệt này là ID nào (lưu vào localStorage)
    let localId = localStorage.getItem('gameo_player_id');
    if (!localId) {
      localId = 'player_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('gameo_player_id', localId);
    }
    setMyId(localId);

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

  // Hàm để nhận vai trò (Cái hoặc một vị trí người chơi)
  const takeRole = (type: 'dealer' | 'player', index?: number) => {
    const newState = { ...gameState };
    if (type === 'dealer') {
      newState.dealer.id = myId;
      newState.dealer.name = "Nhà Cái (Bạn)";
    } else if (index !== undefined) {
      newState.players[index].id = myId;
      newState.players[index].name = `Người chơi ${index + 1} (Bạn)`;
    }
    updateRemoteState(newState);
  };

  const isDealer = gameState.dealer.id === myId;
  const myPlayerIndex = gameState.players.findIndex(p => p.id === myId);

  // Logic Game (Giữ nguyên từ bản trước nhưng thêm kiểm tra quyền)
  const startNewGame = () => {
    if (!isDealer) return alert("Chỉ Nhà Cái mới được bắt đầu ván mới!");
    
    let newDeck = shuffle(createDeck());
    const dealerHand = [newDeck.pop()!, { ...newDeck.pop()!, isRevealed: false }];
    const updatedPlayers = gameState.players.map(p => {
      const hand = [newDeck.pop()!, newDeck.pop()!];
      return { ...p, hand: hand as CardType[], score: calculateScore(hand as CardType[]), status: 'playing' as any, isChecked: false, gameResult: null };
    });

    updateRemoteState({ ...gameState, deck: newDeck, dealer: { ...gameState.dealer, hand: dealerHand as CardType[], score: calculateScore(dealerHand as CardType[]), status: 'playing' }, players: updatedPlayers, status: 'playing' });
  };

  const hit = (idx: number) => {
    if (gameState.players[idx].id !== myId) return; // Chỉ mình mới được rút bài mình
    const newDeck = [...gameState.deck];
    const newCard = newDeck.pop()!;
    const updatedPlayers = [...gameState.players];
    const player = updatedPlayers[idx];
    const newHand = [...player.hand, newCard];
    const newScore = calculateScore(newHand);
    updatedPlayers[idx] = { ...player, hand: newHand, score: newScore, status: newScore > 21 ? 'bust' : (newHand.length === 5 ? 'ngu_linh' : 'playing') };
    updateRemoteState({ ...gameState, deck: newDeck, players: updatedPlayers });
  };

  const stand = (idx: number) => {
    if (gameState.players[idx].id !== myId) return;
    const updatedPlayers = [...gameState.players];
    updatedPlayers[idx].status = 'stay';
    updateRemoteState({ ...gameState, players: updatedPlayers });
  };

  const checkPlayer = (idx: number) => {
    if (!isDealer) return;
    const dealerScore = calculateScore(gameState.dealer.hand.map(c => ({ ...c, isRevealed: true })));
    const updatedPlayers = [...gameState.players];
    const player = updatedPlayers[idx];
    let result: 'win' | 'lose' | 'draw' = (player.status === 'bust' || dealerScore > player.score) ? 'lose' : (dealerScore < player.score || dealerScore > 21 ? 'win' : 'draw');
    updatedPlayers[idx] = { ...player, isChecked: true, gameResult: result };
    updateRemoteState({ ...gameState, players: updatedPlayers });
  };

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '1200px' }}>
        <h1>XÌ DÁCH REALTIME</h1>
        <div style={{ background: 'var(--gold)', color: 'black', padding: '5px 15px', borderRadius: '10px', fontWeight: 'bold' }}>
          {isDealer ? 'VAI TRÒ: NHÀ CÁI 👑' : myPlayerIndex !== -1 ? `VAI TRÒ: NGƯỜI CHƠI ${myPlayerIndex + 1} 👤` : 'CHƯA CHỌN VỊ TRÍ'}
        </div>
      </div>
      
      <div className="table-area">
        {/* Dealer Section */}
        <div className="dealer-section" style={{ border: isDealer ? '2px solid var(--gold)' : 'none', borderRadius: '15px' }}>
          <div className="score-badge">{gameState.dealer.name}</div>
          <div className="hand">
            {gameState.dealer.hand.map((card, i) => <Card key={i} card={card} index={i} />)}
          </div>
          {isDealer ? (
            <div className="controls" style={{ marginTop: '10px' }}>
              <button className="btn-xet" onClick={() => updateRemoteState({...gameState, dealer: {...gameState.dealer, hand: [...gameState.dealer.hand, gameState.deck.pop()!]}})}>Rút bài Cái</button>
              <button className="btn-xet" style={{ marginLeft: '10px' }} onClick={() => updateRemoteState({...gameState, dealer: {...gameState.dealer, hand: gameState.dealer.hand.map(c => ({...c, isRevealed: true}))}})}>Mở bài Cái</button>
            </div>
          ) : (
            <button className="btn-xet" onClick={() => takeRole('dealer')}>Làm Cái 👑</button>
          )}
        </div>

        {/* Players Grid */}
        <div className="players-grid">
          {gameState.players.map((player, idx) => (
            <div key={player.id} className={`player-box ${player.id === myId ? 'active' : ''}`}>
              <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{player.name}</div>
              <div className="hand">
                {player.hand.map((card, i) => <Card key={i} card={card} index={i} />)}
              </div>
              {player.id === '' ? (
                <button className="btn-xet" onClick={() => takeRole('player', idx)}>Ngồi đây</button>
              ) : (
                <>
                  <div className="score-badge" style={{ fontSize: '0.7rem' }}>Điểm: {player.score}</div>
                  {player.gameResult && <div className={`status-tag status-${player.gameResult}`}>{player.gameResult}</div>}
                  {player.id === myId && player.status === 'playing' && (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button className="btn-xet" onClick={() => hit(idx)}>Rút</button>
                      <button className="btn-xet" onClick={() => stand(idx)}>Dừng</button>
                    </div>
                  )}
                  {isDealer && (player.status === 'stay' || player.status === 'bust') && !player.isChecked && (
                    <button className="btn-xet" style={{ background: 'red', color: 'white' }} onClick={() => checkPlayer(idx)}>XÉT</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="controls">
        <button className="btn btn-gold" onClick={startNewGame} disabled={!isDealer}>Bắt đầu ván mới</button>
      </div>
    </main>
  );
}
