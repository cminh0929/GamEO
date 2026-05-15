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
  processedTransactions: [],
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
      // Cập nhật ngay lập tức để đảm bảo đồng bộ, 
      // bỏ qua kiểm tra timestamp khắt khe để tránh lỗi lệch đồng hồ máy tính
      setGameState(state);
      gameStateRef.current = state;
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

  const checkPlayer = useCallback(async (idx: number) => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    const gs = gameStateRef.current;
    try {
      if (gs.dealer.id !== profile?.id) return;

      const player = gs.players[idx];
      // Idempotency guard — prevent double-charge if state update races
      if (player.isChecked) return;

      const updatedPlayers = [...gs.players];
      const bet = player.currentBet;
      let dealerBalanceDelta = 0;
      let newPlayerBalance = player.balance;
      
      // Khởi tạo/Lấy danh sách tx đã xử lý
      const processedTx = gs.processedTransactions || [];
      const roundKey = gs.roundId || `fallback-${gs.lastActionAt || 0}`; // Dùng roundId làm key cố định

      const engine = new XiDachEngine(gs);
      const checkStatus = engine.canDealerCheck(gs.dealer);
      if (!checkStatus.allowed) {
        alert(checkStatus.reason);
        return;
      }

      const totalTableBets = gs.players.reduce((acc, p) => acc + (p.currentBet || 0), 0);
      const settlement = XiDachEngine.calculatePlayerSettlement(player, gs.dealer, totalTableBets);

      // Idempotency check cho Player
      const playerTxId = `${settlement.type}-${player.id}-${roundKey}`;

      if (!processedTx.includes(playerTxId)) {
        await executeTransaction(player.id, settlement.amount, settlement.type, settlement.description);
        processedTx.push(playerTxId);
      }
      newPlayerBalance = Math.max(0, player.balance + settlement.amount);

      // Idempotency check cho Dealer
      const dealerTxId = `dealer-${player.id}-${roundKey}`;
      if (gs.dealer.id && !processedTx.includes(dealerTxId)) {
        const dType = settlement.amount > 0 ? 'lose' : (settlement.amount < 0 ? 'win' : 'draw');
        const dDesc = settlement.amount > 0 ? `Trả thưởng cho người chơi (${player.id})` : (settlement.amount < 0 ? `Thắng cược từ người chơi (${player.id})` : `Hòa với người chơi (${player.id})`);
        await executeTransaction(gs.dealer.id, -settlement.amount, dType, dDesc);
        processedTx.push(dealerTxId);
      }

      updatedPlayers[idx] = { ...player, isChecked: true, gameResult: settlement.result, balance: newPlayerBalance };
      updateRemoteState({
        ...gs,
        players: updatedPlayers,
        dealer: { ...gs.dealer, balance: gs.dealer.balance - settlement.amount },
        processedTransactions: processedTx,
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
    const gs = gameStateRef.current;
    try {
      const engine = new XiDachEngine(gs);
      const checkStatus = engine.canDealerCheck(gs.dealer);
      if (!checkStatus.allowed) {
        alert(checkStatus.reason);
        return;
      }

      const updatedPlayers = [...gs.players];
      // Track cumulative dealer balance change across all players
      let totalDealerDelta = 0;
      
      // Khởi tạo/Lấy danh sách tx đã xử lý
      const processedTx = gs.processedTransactions || [];
      const roundKey = gs.roundId || `fallback-${gs.lastActionAt || 0}`;

      for (let idx = 0; idx < updatedPlayers.length; idx++) {
        const player = updatedPlayers[idx];
        // Idempotency guard — skip empty seats and already-settled players
        if (player.id === '' || player.isChecked) continue;

        const totalTableBets = gs.players.reduce((acc, p) => acc + (p.currentBet || 0), 0);
        const settlement = XiDachEngine.calculatePlayerSettlement(player, gs.dealer, totalTableBets);

        let newPlayerBalance = player.balance;

        if (true) { // Luôn cho phép ghi log (kể cả amount = 0)
          const txId = `${settlement.type}-${player.id}-${roundKey}`;
          if (!processedTx.includes(txId)) {
            await executeTransaction(player.id, settlement.amount, settlement.type, settlement.description);
            processedTx.push(txId);
          }
          newPlayerBalance = Math.max(0, player.balance + settlement.amount);
          totalDealerDelta -= settlement.amount;
        }
        
        updatedPlayers[idx] = { ...player, isChecked: true, gameResult: settlement.result, balance: newPlayerBalance };
      }

      // Thực hiện giao dịch tổng cho Nhà cái nếu có thay đổi
      const dealerTxId = `dealer-all-${roundKey}`;
      if (totalDealerDelta !== 0 && gs.dealer.id && !processedTx.includes(dealerTxId)) {
        const type = totalDealerDelta > 0 ? 'win' : 'lose';
        const desc = totalDealerDelta > 0 ? 'Thắng cược tổng từ bàn chơi' : 'Thua cược tổng cho bàn chơi';
        await executeTransaction(gs.dealer.id, totalDealerDelta, type, desc);
        processedTx.push(dealerTxId);
      }

      updateRemoteState({
        ...gs,
        players: updatedPlayers,
        dealer: { ...gs.dealer, balance: gs.dealer.balance + totalDealerDelta },
        processedTransactions: processedTx,
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

    // Nếu vừa chia bài xong mà trạng thái là 'ended' (Nhà cái có Xì Bàng/Xì Dách)
    // Tự động kích hoạt thanh toán cả bàn
    if (newState.status === 'ended' && newState.dealer.id === profile?.id) {
      setTimeout(() => {
        checkAllPlayers();
      }, 1000);
    }
  }, [profile, updateRemoteState, checkAllPlayers]);

  const hit = useCallback((idx: number) => {
    const gs = gameStateRef.current;
    if (gs.turnIndex !== idx) return;
    const player = gs.players[idx];
    if (player.hand.length >= 5) return alert('Đã đạt giới hạn tối đa 5 lá bài!');

    const engine = new XiDachEngine(gs);
    const newState = engine.hit(idx);
    updateRemoteState(newState);
  }, [updateRemoteState]);

  const stand = useCallback(async (idxOrAuto: number | boolean = false) => {
    const gs = gameStateRef.current;
    const isAuto = typeof idxOrAuto === 'number' || idxOrAuto === true;
    const targetIdx = typeof idxOrAuto === 'number' ? idxOrAuto : gs.players.findIndex(p => p.id === profile?.id);

    if (targetIdx === -1 || gs.turnIndex !== targetIdx) return;
    
    const player = gs.players[targetIdx];
    const score = Hand.calculateScore(player.hand);
    const special = Hand.checkSpecialHands(player);
    const isSpecial = special === 'xi_bang' || special === 'xi_dach' || special === 'ngu_linh';
    
    // Manual stand requires 16 points or special hand
    if (!isAuto && !isSpecial && score < 16) {
      alert('Bạn phải đủ ít nhất 16 điểm mới được dằn!');
      return;
    }

    const engine = new XiDachEngine(gs);
    const newState = engine.stand(targetIdx);
    updateRemoteState(newState);
  }, [profile, updateRemoteState]);

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
