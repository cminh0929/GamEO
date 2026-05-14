'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GameRoomService } from '../lib/services/GameRoomService';
import { Deck } from '../lib/game/Deck';
import { Hand } from '../lib/game/Hand';
import { supabase } from '../lib/supabase';
import type { GameState, GameStatus, CardType } from '../types/game';
import type { Profile } from '../types/platform';

const ROOM_ID = 'gameo-table-1';

const createEmptyState = (): GameState => ({
  deck: [],
  dealer: { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 },
  players: Array.from({ length: 7 }, (_, i) => ({
    id: '', name: `Vị trí ${i + 1}`, hand: [], score: 0, status: 'playing',
    isChecked: false, gameResult: null, balance: 0, currentBet: 0,
  })),
  status: 'ended',
  turnIndex: 0,
  lastActionAt: Date.now(),
});

type ExecuteTransaction = (userId: string, amount: number, type: string, description: string) => Promise<void>;

export function useXiDachRoom(
  profile: Profile | null,
  executeTransaction: ExecuteTransaction,
) {
  const [gameState, setGameState] = useState<GameState>(createEmptyState());
  // Ref always holds the latest gameState — fixes stale closure race condition
  // where concurrent players overwrite each other's state
  const gameStateRef = useRef<GameState>(gameState);
  // Prevent rapid double-clicks on XÉT from stacking transactions
  const isCheckingRef = useRef(false);

  // Fetch initial state + subscribe to realtime updates
  useEffect(() => {
    GameRoomService.fetchGameState(ROOM_ID).then((state) => {
      if (state) { setGameState(state); gameStateRef.current = state; }
    });

    const channel = GameRoomService.subscribeToRoom(ROOM_ID, (state) => {
      setGameState(state);
      gameStateRef.current = state;
    });
    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateRemoteState = useCallback(async (newState: GameState) => {
    setGameState(newState);
    gameStateRef.current = newState;
    await GameRoomService.updateGameState(ROOM_ID, newState);
  }, []);

  const getNextTurnState = useCallback((current: GameState): GameState => {
    let nextIdx = current.turnIndex + 1;
    while (nextIdx < current.players.length && current.players[nextIdx].id === '') nextIdx++;
    if (nextIdx >= current.players.length) {
      return { ...current, turnIndex: -1, turnDeadline: 0 };
    }
    return { ...current, turnIndex: nextIdx, turnDeadline: Date.now() + 30000 };
  }, []);

  // --- Game actions ---
  const takeRole = useCallback((type: 'dealer' | 'player', index?: number) => {
    if (!profile) return;
    const gs = gameStateRef.current;
    const alreadySeated =
      gs.players.some((p) => p.id === profile.id) ||
      gs.dealer.id === profile.id;
    if (alreadySeated) return alert('Bạn đã có vị trí rồi!');

    const newState = { ...gs, lastActionAt: Date.now() };
    if (type === 'dealer') {
      newState.dealer = {
        ...newState.dealer,
        id: profile.id, name: `${profile.username} 👑`,
        balance: profile.balance, avatarUrl: profile.avatar_url ?? undefined,
      };
    } else if (index !== undefined) {
      newState.players[index] = {
        ...newState.players[index],
        id: profile.id, name: profile.username,
        balance: profile.balance, avatarUrl: profile.avatar_url ?? undefined,
      };
    }
    updateRemoteState(newState);
  }, [profile, updateRemoteState]);

  const kickPlayer = useCallback((index: number) => {
    const gs = gameStateRef.current;
    if (gs.dealer.id !== profile?.id) return;
    if (gs.status === 'playing') return alert('Không thể kích người chơi khi đang trong ván bài!');
    const newState = { ...gs, lastActionAt: Date.now() };
    newState.players[index] = {
      id: '', name: `Vị trí ${index + 1}`, hand: [], score: 0, status: 'playing',
      isChecked: false, gameResult: null, balance: 0, currentBet: 0,
    };
    updateRemoteState(newState);
  }, [profile, updateRemoteState]);

  const leaveRole = useCallback(async () => {
    if (!profile) return;
    const gs = gameStateRef.current;
    const newState = { ...gs, lastActionAt: Date.now() };
    const isGameActive = gs.status === 'playing';

    if (newState.dealer.id === profile.id) {
      const isRoomActive = gs.status === 'playing' || gs.status === 'betting';
      if (isRoomActive) {
        newState.status = 'ended';
        newState.players.forEach((p) => {
          p.hand = []; p.currentBet = 0; p.gameResult = null;
          p.isChecked = false; p.status = 'playing';
        });
      }
      newState.dealer = { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 };
    } else {
      const pIdx = newState.players.findIndex((p) => p.id === profile.id);
      if (pIdx !== -1) {
        const player = newState.players[pIdx];
        if (isGameActive && player.hand.length > 0 && !player.isChecked) {
          const bet = player.currentBet;
          await executeTransaction(player.id, -bet, 'penalty', 'Phạt thoát ván bài (Rage Quit)');
          if (newState.dealer.id) {
            await executeTransaction(newState.dealer.id, bet, 'win', `Nhà Cái hưởng tiền từ ${player.name} thoát bàn`);
          }
          newState.dealer.balance += bet;
        }
        newState.players[pIdx] = {
          id: '', name: `Vị trí ${pIdx + 1}`, hand: [], score: 0, status: 'playing',
          isChecked: false, gameResult: null, balance: 0, currentBet: 0,
        };
        if (gs.turnIndex === pIdx) {
          const next = getNextTurnState(newState);
          newState.turnIndex = next.turnIndex;
          newState.turnDeadline = next.turnDeadline;
        }
      }
    }
    updateRemoteState(newState);
  }, [profile, executeTransaction, getNextTurnState, updateRemoteState]);

  const placeBet = useCallback(async (index: number, amount: number) => {
    if (!profile || amount <= 0) return;
    if (amount > profile.balance) return alert('Không đủ tiền!');
    const newState = { ...gameStateRef.current, lastActionAt: Date.now() };
    newState.players[index].currentBet = amount;
    updateRemoteState(newState);
  }, [profile, updateRemoteState]);

  const startNewGame = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.dealer.id !== profile?.id) return alert('Chỉ Nhà Cái mới được bắt đầu!');

    if (gs.status !== 'betting') {
      const newState = {
        ...gs,
        status: 'betting' as GameStatus,
        lastActionAt: Date.now(),
        dealer: { ...gs.dealer, hand: [], score: 0, status: 'playing' as const },
      };
      newState.players = newState.players.map((p) => ({
        ...p, currentBet: 0, gameResult: null, isChecked: false, hand: [], status: 'playing' as const,
      }));
      updateRemoteState(newState);
      return;
    }

    const activePlayers = gs.players.filter((p) => p.id !== '');
    if (activePlayers.length === 0) return alert('Cần ít nhất 1 người chơi để bắt đầu!');
    if (activePlayers.some((p) => p.currentBet <= 0)) return alert('Còn người chưa cược!');

    const newDeck = Deck.createShuffled();
    const dealerHand = [newDeck.pop()!, newDeck.pop()!];
    const updatedPlayers = gs.players.map((p) => {
      if (p.id === '') return p;
      const hand = [newDeck.pop()!, newDeck.pop()!];
      return { ...p, hand: hand as CardType[], score: Hand.calculateScore(hand as CardType[]), status: 'playing' as const, isChecked: false };
    });

    const firstPlayerIndex = updatedPlayers.findIndex((p) => p.id !== '');
    updateRemoteState({
      ...gs, deck: newDeck,
      dealer: { ...gs.dealer, hand: dealerHand as CardType[], score: Hand.calculateScore(dealerHand as CardType[]), status: 'playing' },
      players: updatedPlayers, status: 'playing',
      turnIndex: firstPlayerIndex !== -1 ? firstPlayerIndex : 0,
      turnDeadline: Date.now() + 30000,
      lastActionAt: Date.now(),
    });
  }, [profile, updateRemoteState]);

  const hit = useCallback((idx: number) => {
    const gs = gameStateRef.current;
    if (gs.turnIndex !== idx) return;
    const player = gs.players[idx];
    if (player.hand.length >= 5) return alert('Đã đạt giới hạn tối đa 5 lá bài!');

    const newDeck = [...gs.deck];
    const newCard = newDeck.pop()!;
    const updatedPlayers = [...gs.players];
    const newHand = [...player.hand, newCard];
    const newScore = Hand.calculateScore(newHand);
    const isBust = newScore >= 28;
    const isMaxCards = newHand.length === 5;

    if (isBust) {
      // Chỉ đánh dấu bust — penalty sẽ tính khi dealer XÉT
      // Người chơi vẫn có quyền câu giờ và tự bấm Stand
      updatedPlayers[idx] = { ...player, hand: newHand, score: newScore, status: 'bust' };
      updateRemoteState({ ...gs, deck: newDeck, players: updatedPlayers, lastActionAt: Date.now() });
    } else {
      updatedPlayers[idx] = { ...player, hand: newHand, score: newScore, status: isMaxCards ? 'stay' : 'playing' };
      const nextState = { ...gs, deck: newDeck, players: updatedPlayers, lastActionAt: Date.now() };
      updateRemoteState(isMaxCards ? getNextTurnState(nextState) : nextState);
    }
  }, [getNextTurnState, updateRemoteState]);

  const stand = useCallback((idx: number) => {
    const gs = gameStateRef.current;
    if (gs.turnIndex !== idx) return;
    const updatedPlayers = [...gs.players];
    // Bust players stay as 'bust', non-bust players become 'stay'
    if (updatedPlayers[idx].status !== 'bust') {
      updatedPlayers[idx].status = 'stay';
    }
    updateRemoteState(getNextTurnState({ ...gs, players: updatedPlayers, lastActionAt: Date.now() }));
  }, [getNextTurnState, updateRemoteState]);

  const checkPlayer = useCallback(async (idx: number) => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    try {
      const gs = gameStateRef.current;
      if (gs.dealer.id !== profile?.id) return;

      const updatedPlayers = [...gs.players];
      const player = updatedPlayers[idx];
      const bet = player.currentBet;

      // Bust (quắc >=28) — đền nguyên bàn
      if (player.status === 'bust') {
        const otherPlayers = gs.players.filter((p) => p.id !== '' && p.id !== player.id);
        const totalTableBet = otherPlayers.reduce((sum, p) => sum + p.currentBet, 0) + bet;
        await executeTransaction(player.id, -totalTableBet, 'penalty', `ĐỀN NGUYÊN BÀN (Quắc ${player.score}đ)`);
        if (gs.dealer.id) await executeTransaction(gs.dealer.id, totalTableBet, 'win', `Nhà Cái thu tiền đền từ ${player.name}`);
        updatedPlayers[idx] = { ...player, isChecked: true, gameResult: 'lose' };
        updateRemoteState({ ...gs, players: updatedPlayers, lastActionAt: Date.now() });
        return;
      }

      // Normal check
      const dealerScore = Hand.calculateScore(gs.dealer.hand);
      if (dealerScore < 15 && gs.dealer.hand.length < 5) {
        alert('Nhà Cái phải đủ ít nhất 15 điểm hoặc 5 lá bài mới được quyền XÉT!');
        return;
      }

      let multiplier = 1;
      const playerSpecial = Hand.checkSpecialHands(player);
      const dealerSpecial = Hand.checkSpecialHands(gs.dealer);

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
      }

      const finalWinAmount = bet * multiplier;
      if (result === 'win') {
        await executeTransaction(player.id, finalWinAmount, 'win', `Thắng ván bài (${playerSpecial || player.score + 'đ'}) x${multiplier}`);
        await executeTransaction(gs.dealer.id, -finalWinAmount, 'lose', `Thua cho ${player.name}`);
      } else if (result === 'lose') {
        await executeTransaction(player.id, -bet, 'lose', `Thua ván bài (${player.score + 'đ'})`);
        await executeTransaction(gs.dealer.id, bet, 'win', `Thắng từ ${player.name}`);
      }

      updatedPlayers[idx] = { ...player, isChecked: true, gameResult: result };
      updateRemoteState({ ...gs, players: updatedPlayers, lastActionAt: Date.now() });
    } finally {
      isCheckingRef.current = false;
    }
  }, [profile, executeTransaction, updateRemoteState]);

  // Xét tất cả người chơi còn lại cùng lúc (dùng sau khi tất cả đã stand/bust)
  const checkAllPlayers = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    try {
      const gs = gameStateRef.current;
      if (gs.dealer.id !== profile?.id) return;
      const dealerScore = Hand.calculateScore(gs.dealer.hand);
      if (dealerScore < 15 && gs.dealer.hand.length < 5) {
        alert('Nhà Cái phải đủ ít nhất 15 điểm hoặc 5 lá bài mới được quyền XÉT!');
        return;
      }

      const updatedPlayers = [...gs.players];
      for (let idx = 0; idx < updatedPlayers.length; idx++) {
        const player = updatedPlayers[idx];
        if (player.id === '' || player.isChecked) continue;

        const bet = player.currentBet;

        if (player.status === 'bust') {
          const otherPlayers = gs.players.filter((p) => p.id !== '' && p.id !== player.id);
          const totalTableBet = otherPlayers.reduce((sum, p) => sum + p.currentBet, 0) + bet;
          await executeTransaction(player.id, -totalTableBet, 'penalty', `ĐỀN NGUYÊN BÀN (Quắc ${player.score}đ)`);
          if (gs.dealer.id) await executeTransaction(gs.dealer.id, totalTableBet, 'win', `Nhà Cái thu tiền đền từ ${player.name}`);
          updatedPlayers[idx] = { ...player, isChecked: true, gameResult: 'lose' };
          continue;
        }

        let multiplier = 1;
        const playerSpecial = Hand.checkSpecialHands(player);
        const dealerSpecial = Hand.checkSpecialHands(gs.dealer);
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
        }
        const finalWinAmount = bet * multiplier;
        if (result === 'win') {
          await executeTransaction(player.id, finalWinAmount, 'win', `Thắng ván bài (${playerSpecial || player.score + 'đ'}) x${multiplier}`);
          await executeTransaction(gs.dealer.id, -finalWinAmount, 'lose', `Thua cho ${player.name}`);
        } else if (result === 'lose') {
          await executeTransaction(player.id, -bet, 'lose', `Thua ván bài (${player.score + 'đ'})`);
          await executeTransaction(gs.dealer.id, bet, 'win', `Thắng từ ${player.name}`);
        }
        updatedPlayers[idx] = { ...player, isChecked: true, gameResult: result };
      }
      updateRemoteState({ ...gs, players: updatedPlayers, lastActionAt: Date.now() });
    } finally {
      isCheckingRef.current = false;
    }
  }, [profile, executeTransaction, updateRemoteState]);

  const dealerHit = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.dealer.id !== profile?.id) return;
    if (gs.dealer.hand.length >= 5) return alert('Nhà Cái đã đạt giới hạn 5 lá bài!');
    if (gs.players.some((p) => p.id !== '' && p.isChecked)) return alert('Đã xét bài, không thể rút thêm!');
    const newDeck = [...gs.deck];
    const newCard = newDeck.pop()!;
    const newHand = [...gs.dealer.hand, newCard];
    updateRemoteState({
      ...gs, deck: newDeck,
      dealer: { ...gs.dealer, hand: newHand, score: Hand.calculateScore(newHand) },
      lastActionAt: Date.now(),
    });
  }, [profile, updateRemoteState]);

  const resetTableToEmpty = useCallback(async () => {
    await updateRemoteState(createEmptyState());
  }, [updateRemoteState]);

  return {
    gameState,
    actions: {
      takeRole,
      kickPlayer,
      leaveRole,
      placeBet,
      startNewGame,
      hit,
      stand,
      checkPlayer,
      checkAllPlayers,
      dealerHit,
      resetTableToEmpty,
    },
  };
}
