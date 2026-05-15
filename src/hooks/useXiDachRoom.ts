'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GameRoomService } from '../lib/services/GameRoomService';
import { Deck } from '../lib/game/Deck';
import { Hand } from '../lib/game/Hand';
import { XiDachEngine } from '../lib/game/XiDachEngine';
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
  refreshLogs?: () => Promise<void>,
  isAdmin?: boolean,
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
      // Only update if the received state is newer than current (using lastActionAt)
      // This prevents late-arriving events from overwriting local optimistic updates
      if (!gameStateRef.current.lastActionAt || (state.lastActionAt && state.lastActionAt > gameStateRef.current.lastActionAt)) {
        setGameState(state);
        gameStateRef.current = state;
      } else if (state.lastActionAt === gameStateRef.current.lastActionAt) {
        // Same timestamp, but could be different content if multiple updates happened in same ms
        // (Unlikely but possible). We update anyway to be safe if it's not our local state.
        setGameState(state);
        gameStateRef.current = state;
      }
    });
    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateRemoteState = useCallback(async (newState: GameState) => {
    const oldState = gameStateRef.current;
    // Optimistic update
    setGameState(newState);
    gameStateRef.current = newState;

    try {
      await GameRoomService.updateGameState(ROOM_ID, newState);
    } catch (err) {
      console.error('[updateRemoteState] Failed to sync state:', err);
      // Revert on failure
      setGameState(oldState);
      gameStateRef.current = oldState;
      alert('Không thể kết nối máy chủ để cập nhật ván bài. Vui lòng kiểm tra kết nối!');
    }
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
  const MIN_BALANCE_TO_SIT = 10_000;

  const takeRole = useCallback((type: 'dealer' | 'player', index?: number) => {
    if (!profile) return;
    if (profile.balance < MIN_BALANCE_TO_SIT)
      return alert(`Số dư tối thiểu ${MIN_BALANCE_TO_SIT.toLocaleString()}đ mới được ngồi vào bàn!`);

    try {
      const engine = new XiDachEngine(gameStateRef.current);
      const newState = engine.takeRole(type, profile, index);
      updateRemoteState(newState);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi nhận chỗ!');
    }
  }, [profile, updateRemoteState]);

  const kickPlayer = useCallback((index: number | 'dealer') => {
    const gs = gameStateRef.current;
    const isDealer = gs.dealer.id === profile?.id;

    if (!isDealer && !isAdmin) return;
    if (gs.status === 'playing' && !isAdmin) {
      return alert('Không thể kích người chơi khi đang trong ván bài!');
    }

    const engine = new XiDachEngine(gs);
    const newState = engine.kickPlayer(index);
    updateRemoteState(newState);
  }, [profile, isAdmin, updateRemoteState]);

  const leaveRole = useCallback(async () => {
    if (!profile) return;
    const gs = gameStateRef.current;
    const newState = { ...gs, lastActionAt: Date.now() };
    const isGameActive = gs.status === 'playing';

    if (newState.dealer.id === profile.id) {
      const isRoomActive = gs.status === 'playing' || gs.status === 'betting';
      if (isRoomActive) {
        newState.status = 'ended';
        // Fix: clone players array properly instead of mutating through shallow ref
        newState.players = newState.players.map((p) => ({
          ...p, hand: [], currentBet: 0, gameResult: null, isChecked: false, status: 'playing' as const,
        }));
      }
      newState.dealer = { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 };
    } else {
      const pIdx = newState.players.findIndex((p) => p.id === profile.id);
      if (pIdx !== -1) {
        const player = newState.players[pIdx];
        if (isGameActive && player.hand.length > 0 && !player.isChecked) {
          const bet = player.currentBet;
          try {
            // Fix: try/catch so failed tx does NOT silently remove player without payment
            await executeTransaction(player.id, -bet, 'penalty', 'Phạt thoát ván bài (Rage Quit)');
            if (newState.dealer.id) {
              await executeTransaction(newState.dealer.id, bet, 'win', `Nhà Cái hưởng tiền từ ${player.name} thoát bàn`);
            }
            newState.dealer = { ...newState.dealer, balance: newState.dealer.balance + bet };
          } catch (err) {
            console.error('[leaveRole] Rage-quit transaction failed — aborting leave:', err);
            alert('Lỗi giao dịch! Không thể rời bàn. Vui lòng thử lại.');
            return; // Abort: do NOT remove player from seat if payment failed
          }
        }
        newState.players = newState.players.map((p, i) =>
          i === pIdx
            ? { id: '', name: `Vị trí ${pIdx + 1}`, hand: [], score: 0, status: 'playing' as const, isChecked: false, gameResult: null, balance: 0, currentBet: 0 }
            : p
        );
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
    
    const engine = new XiDachEngine(gameStateRef.current);
    const newState = engine.placeBet(index, amount);
    updateRemoteState(newState);
  }, [profile, updateRemoteState]);

  const startNewGame = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.dealer.id !== profile?.id) return alert('Chỉ Nhà Cái mới được bắt đầu!');

    if (gs.status === 'betting') {
      const activePlayers = gs.players.filter((p) => p.id !== '');
      if (activePlayers.length === 0) return alert('Cần ít nhất 1 người chơi để bắt đầu!');
      if (activePlayers.some((p) => p.currentBet <= 0)) return alert('Còn người chưa cược!');
    }

    const engine = new XiDachEngine(gs);
    const newState = engine.startNewGame();
    updateRemoteState(newState);
  }, [profile, updateRemoteState]);

  const hit = useCallback((idx: number) => {
    const gs = gameStateRef.current;
    if (gs.turnIndex !== idx) return;
    const player = gs.players[idx];
    if (player.hand.length >= 5) return alert('Đã đạt giới hạn tối đa 5 lá bài!');

    const engine = new XiDachEngine(gs);
    const newState = engine.hit(idx);
    updateRemoteState(newState);
  }, [updateRemoteState]);

  const stand = useCallback((idx: number) => {
    const gs = gameStateRef.current;
    if (gs.turnIndex !== idx) return;
    const player = gs.players[idx];

    if (player.hand.length < 5 && player.score < 16) {
      return alert('Điểm dưới 16 — bạn phải rút thêm bài trước khi dừng!');
    }

    const engine = new XiDachEngine(gs);
    const newState = engine.stand(idx);
    updateRemoteState(newState);
  }, [updateRemoteState]);

  const checkPlayer = useCallback(async (idx: number) => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    try {
      const gs = gameStateRef.current;
      if (gs.dealer.id !== profile?.id) return;

      const player = gs.players[idx];
      // Idempotency guard — prevent double-charge if state update races
      if (player.isChecked) return;

      const updatedPlayers = [...gs.players];
      const bet = player.currentBet;
      let dealerBalanceDelta = 0;
      let newPlayerBalance = player.balance;

      // Bust (quắc >=28) — đền nguyên bàn, nhưng không âm (floor về 0)
      if (player.status === 'bust') {
        const otherPlayers = gs.players.filter((p) => p.id !== '' && p.id !== player.id);
        const totalTableBet = otherPlayers.reduce((sum, p) => sum + p.currentBet, 0) + bet;
        // Cap penalty: không được trừ quá số dư hiện tại
        const actualPenalty = Math.min(player.balance, totalTableBet);
        await executeTransaction(player.id, -actualPenalty, 'penalty',
          `Quắc (${player.score}đ) - Đền nguyên bàn ${actualPenalty < totalTableBet ? '(hết tiền)' : ''}`);
        if (gs.dealer.id) await executeTransaction(gs.dealer.id, actualPenalty, 'win',
          `Nhà Cái thu tiền đền từ ${player.name} (Quắc)`);
        dealerBalanceDelta = actualPenalty;
        newPlayerBalance = player.balance - actualPenalty; // = 0 nếu hết tiền
        updatedPlayers[idx] = { ...player, isChecked: true, gameResult: 'lose', balance: newPlayerBalance };
        updateRemoteState({
          ...gs,
          players: updatedPlayers,
          dealer: { ...gs.dealer, balance: gs.dealer.balance + dealerBalanceDelta },
          lastActionAt: Date.now(),
        });
        return;
      }

      // Normal check
      const dealerScore = Hand.calculateScore(gs.dealer.hand);
      if (dealerScore < 15 && gs.dealer.hand.length < 5) {
        alert('Nhà Cái phải đủ ít nhất 15 điểm hoặc 5 lá bài mới được quyền XÉT!');
        return;
      }
      let { result, multiplier, specialHand } = XiDachEngine.calculateResult(player, gs.dealer);

      const finalWinAmount = bet * multiplier;
      const totalTableBets = gs.players.reduce((acc, p) => acc + (p.currentBet || 0), 0);

      if (player.status === 'den') {
        // PHẠT ĐỀN BÀI: Mất tổng cược cả bàn
        const penaltyAmount = totalTableBets;
        await executeTransaction(player.id, -penaltyAmount, 'lose', `Đền bài (>= 28đ) - Phạt tổng cược bàn`);
        await executeTransaction(gs.dealer.id, penaltyAmount, 'win', `Thắng phạt đền từ ${player.name}`);
        newPlayerBalance = Math.max(0, player.balance - penaltyAmount);
        dealerBalanceDelta = penaltyAmount;
        result = 'lose';
      } else if (result === 'win') {
        await executeTransaction(player.id, finalWinAmount, 'win', `Thắng ván bài (${specialHand || player.score + 'đ'}) x${multiplier}`);
        await executeTransaction(gs.dealer.id, -finalWinAmount, 'lose', `Thua cho ${player.name}`);
        newPlayerBalance = player.balance + finalWinAmount;
        dealerBalanceDelta = -finalWinAmount;
      } else if (result === 'lose') {
        await executeTransaction(player.id, -bet, 'lose', `Thua ván bài (${player.score + 'đ'})`);
        await executeTransaction(gs.dealer.id, bet, 'win', `Thắng từ ${player.name}`);
        newPlayerBalance = player.balance - bet;
        dealerBalanceDelta = bet;
      }

      updatedPlayers[idx] = { ...player, isChecked: true, gameResult: result, balance: newPlayerBalance };
      updateRemoteState({
        ...gs,
        players: updatedPlayers,
        dealer: { ...gs.dealer, balance: gs.dealer.balance + dealerBalanceDelta },
        lastActionAt: Date.now(),
      });
      // Refresh transaction log cho player hiện tại sau khi bị xét
      await refreshLogs?.();
    } catch (err) {
      console.error('[checkPlayer] Transaction failed — game state NOT updated:', err);
      alert('Lỗi giao dịch! Vui lòng thử lại.');
    } finally {
      isCheckingRef.current = false;
    }
  }, [profile, executeTransaction, updateRemoteState, refreshLogs]);

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
      // Track cumulative dealer balance change across all players
      let totalDealerDelta = 0;

      for (let idx = 0; idx < updatedPlayers.length; idx++) {
        const player = updatedPlayers[idx];
        // Idempotency guard — skip empty seats and already-settled players
        if (player.id === '' || player.isChecked) continue;

        const bet = player.currentBet;

        const totalTableBets = gs.players.reduce((acc, p) => acc + (p.currentBet || 0), 0);
        let newPlayerBalance = player.balance;
        let finalResult: 'win' | 'lose' | 'draw' = 'draw';

        if (player.status === 'den') {
          // PHẠT ĐỀN BÀI: Mất tổng cược cả bàn
          const penaltyAmount = totalTableBets;
          await executeTransaction(player.id, -penaltyAmount, 'lose', `Đền bài (>= 28đ) - Phạt tổng cược bàn`);
          newPlayerBalance = Math.max(0, player.balance - penaltyAmount);
          totalDealerDelta += penaltyAmount;
          finalResult = 'lose';
        } else {
          const { result, multiplier, specialHand } = XiDachEngine.calculateResult(player, gs.dealer);
          finalResult = result;
          if (result === 'win') {
            const finalWinAmount = bet * multiplier;
            await executeTransaction(player.id, finalWinAmount, 'win', `Thắng ván bài (${specialHand || player.score + 'đ'}) x${multiplier}`);
            newPlayerBalance = player.balance + finalWinAmount;
            totalDealerDelta -= finalWinAmount;
          } else if (result === 'lose') {
            await executeTransaction(player.id, -bet, 'lose', `Thua ván bài (${player.score + 'đ'})`);
            newPlayerBalance = player.balance - bet;
            totalDealerDelta += bet;
          }
        }
        updatedPlayers[idx] = { ...player, isChecked: true, gameResult: finalResult, balance: newPlayerBalance };
      }

      updateRemoteState({
        ...gs,
        players: updatedPlayers,
        dealer: { ...gs.dealer, balance: gs.dealer.balance + totalDealerDelta },
        lastActionAt: Date.now(),
      });
      // Refresh transaction log cho player hiện tại sau khi bị xét
      await refreshLogs?.();
    } catch (err) {
      console.error('[checkAllPlayers] Transaction failed — game state NOT updated:', err);
      alert('Lỗi giao dịch! Vui lòng thử lại.');
    } finally {
      isCheckingRef.current = false;
    }
  }, [profile, executeTransaction, updateRemoteState, refreshLogs]);

  const dealerHit = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.dealer.id !== profile?.id) return;
    if (gs.dealer.hand.length >= 5) return alert('Nhà Cái đã đạt giới hạn 5 lá bài!');
    
    const activePlayers = gs.players.filter((p) => p.id !== '');
    const allChecked = activePlayers.length > 0 && activePlayers.every((p) => p.isChecked);
    if (allChecked) return alert('Tất cả người chơi đã được xét, không thể rút thêm bài!');

    const engine = new XiDachEngine(gs);
    const newState = engine.dealerHit();
    updateRemoteState(newState);
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
