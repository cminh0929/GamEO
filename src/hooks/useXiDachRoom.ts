'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GameRoomService } from '../lib/services/GameRoomService';
import { Deck } from '../lib/game/Deck';
import { Hand } from '../lib/game/Hand';
import { XiDachEngine } from '../lib/game/XiDachEngine';
import { supabase } from '../lib/supabase';
import type { GameState, GameStatus, CardType } from '../types/game';
import type { Profile } from '../types/platform';
import type { PresenceUser } from './useSpectators';

const ROOM_ID = 'gameo-table-1';
const DEBUG = process.env.NODE_ENV === 'development';

const logDebug = (msg: string, ...args: any[]) => {
  if (DEBUG) console.log(`[XiDachRoom] ${msg}`, ...args);
};

const createEmptyState = (): GameState => ({
  deck: [],
  dealer: { id: '', name: 'Nhà Cái', hand: [], score: 0, status: 'playing', balance: 0, currentBet: 0 },
  players: Array.from({ length: 7 }, (_, i) => ({
    id: '', name: `Vị trí ${i + 1}`, hand: [], score: 0, status: 'playing',
    isChecked: false, gameResult: null, balance: 0, currentBet: 0,
  })),
  status: 'ended',
  turnIndex: 0,
  turnDeadline: 0,
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
  const isProcessingAutoAction = useRef(false);
  // Prevent rapid double-clicks on XÉT from stacking transactions
  const isCheckingRef = useRef(false);

  // Fetch initial state + subscribe to realtime updates
  useEffect(() => {
    GameRoomService.fetchGameState(ROOM_ID).then((state) => {
      if (state) {
        setGameState(state);
        gameStateRef.current = state;

        // TỰ CHỮA LÀNH & XỬ PHẠT: Nếu bàn bị kẹt (status != ended và lastActionAt quá 1 phút)
        const STUCK_TIMEOUT = 1 * 60 * 1000; // 1 phút
        const now = Date.now();
        const hasBots = state.dealer.id.startsWith('00000000-0000-4000-a000-') || 
                        state.players.some(p => p.id.startsWith('00000000-0000-4000-a000-'));
        
        if (!hasBots && state.status !== 'ended' && state.lastActionAt && (now - state.lastActionAt > STUCK_TIMEOUT)) {
          console.warn('[Self-Healing] Phát hiện bàn bị kẹt. Đang xử phạt và Reset...');

          const processStuckPenalty = async () => {
            const emptyState = createEmptyState();

            // Nếu đang trong ván, phạt người đang cầm lượt
            if (state.status === 'playing' && state.turnIndex !== -1) {
              const afkPlayer = state.players[state.turnIndex];
              if (afkPlayer.id && afkPlayer.currentBet > 0) {
                // Idempotency guard — prevents multi-client penalty storm on page load
                const processedTx = state.processedTransactions || [];
                const roundKey = state.roundId || `stuck-${state.lastActionAt || 0}`;
                const penaltyTxId = `stuck-penalty-${afkPlayer.id}-${roundKey}`;

                if (!processedTx.includes(penaltyTxId)) {
                  try {
                    const bet = afkPlayer.currentBet;
                    console.warn(`[Self-Healing] Phạt AFK Player: ${afkPlayer.name} (-${bet})`);
                    await executeTransaction(afkPlayer.id, -bet, 'penalty', 'Phạt làm kẹt bàn (AFK Stuck)');
                    if (state.dealer.id) {
                      await executeTransaction(state.dealer.id, bet, 'win', `Nhà Cái hưởng tiền phạt từ ${afkPlayer.name} (AFK Stuck)`);
                    }
                  } catch (err) {
                    console.error('[Self-Healing] Lỗi khi xử phạt:', err);
                  }
                } else {
                  console.warn('[Self-Healing] Penalty already processed for this round — skipping.');
                }
              }
            } else if (state.status === 'betting') {
              // Nếu đang cược mà kẹt, có thể do Nhà cái không Start — Reset/Refund đơn giản.
            }

            // Cuối cùng mới Reset bàn
            await GameRoomService.updateGameState(ROOM_ID, emptyState);
            setGameState(emptyState);
            gameStateRef.current = emptyState;
            logDebug('Đã xử lý xong và Reset bàn.');
          };

          processStuckPenalty();
        }
      }
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
      if (gs.status === 'playing') {
        alert('Ván bài đang diễn ra, bạn không thể rời bàn lúc này!');
        return;
      }

      if (gs.status === 'betting') {
        // Refund all before ending
        await refundAllPlayers(gs);
        newState.status = 'ended';
      }
      // Fix: clone players array properly instead of mutating through shallow ref
      newState.players = newState.players.map((p) => ({
        ...p, hand: [], currentBet: 0, gameResult: null, isChecked: false, status: 'playing' as const,
      }));
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
      // Key excludes settlement.type to avoid collisions if type changes between rounds with same roundId
      const playerTxId = `settle-${player.id}-${roundKey}`;

      if (!processedTx.includes(playerTxId)) {
        await executeTransaction(player.id, settlement.amount, settlement.type, settlement.description);
        processedTx.push(playerTxId);
        // Lưu trạng thái ngay lập tức sau khi giao dịch Player thành công để tránh lỗi xét lại gây double charge
        newPlayerBalance = Math.max(0, player.balance + settlement.amount);
        const intermediatePlayers = [...gs.players];
        intermediatePlayers[idx] = { ...player, balance: newPlayerBalance };
        await updateRemoteState({
          ...gs,
          players: intermediatePlayers,
          processedTransactions: processedTx,
        });
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

      const outcomeText = settlement.amount > 0 ? `Thắng +$${settlement.amount.toLocaleString()}` : (settlement.amount < 0 ? `Thua -$${Math.abs(settlement.amount).toLocaleString()}` : 'Hòa 🤝');
      const logMessage = `Nhà Cái xét bài ${player.name}: ${outcomeText} (${player.score}đ vs ${gs.dealer.score}đ)`;
      const updatedLogs = [...(gs.actionLogs || [])];
      const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      updatedLogs.push(`[${time}] ${logMessage}`);
      if (updatedLogs.length > 50) updatedLogs.shift();

      updatedPlayers[idx] = { ...player, isChecked: true, gameResult: settlement.result, balance: newPlayerBalance };
      await updateRemoteState({
        ...gs,
        players: updatedPlayers,
        dealer: { ...gs.dealer, balance: gs.dealer.balance - settlement.amount },
        processedTransactions: processedTx,
        actionLogs: updatedLogs,
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
  const checkAllPlayers = useCallback(async (isAuto = false) => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    const gs = gameStateRef.current;
    try {
      const engine = new XiDachEngine(gs);
      const checkStatus = engine.canDealerCheck(gs.dealer);
      if (!checkStatus.allowed) {
        if (!isAuto) alert(checkStatus.reason);
        return;
      }

      const updatedPlayers = [...gs.players];
      // Track cumulative dealer balance change across all players
      let totalDealerDelta = 0;

      // Khởi tạo/Lấy danh sách tx đã xử lý
      const processedTx = gs.processedTransactions || [];
      const roundKey = gs.roundId || `fallback-${gs.lastActionAt || 0}`;

      const updatedLogs = [...(gs.actionLogs || [])];
      const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      let anySettled = false;

      for (let idx = 0; idx < updatedPlayers.length; idx++) {
        const player = updatedPlayers[idx];
        // Idempotency guard — skip empty seats and already-settled players
        if (player.id === '' || player.isChecked) continue;

        const totalTableBets = gs.players.reduce((acc, p) => acc + (p.currentBet || 0), 0);
        const settlement = XiDachEngine.calculatePlayerSettlement(player, gs.dealer, totalTableBets);

        let newPlayerBalance = player.balance;

        // Idempotency check — key excludes settlement.type to avoid type-change collisions
        const txId = `settle-${player.id}-${roundKey}`;
        if (!processedTx.includes(txId)) {
          await executeTransaction(player.id, settlement.amount, settlement.type, settlement.description);
          processedTx.push(txId);
          // Lưu trạng thái của từng người ngay lập tức để tránh lỗi double charge nếu người tiếp theo bị lỗi
          newPlayerBalance = Math.max(0, player.balance + settlement.amount);
          updatedPlayers[idx] = { ...player, isChecked: true, gameResult: settlement.result, balance: newPlayerBalance };
          await updateRemoteState({
            ...gs,
            players: updatedPlayers,
            processedTransactions: processedTx,
            lastActionAt: Date.now(),
          });
        } else {
          newPlayerBalance = Math.max(0, player.balance + settlement.amount);
          updatedPlayers[idx] = { ...player, isChecked: true, gameResult: settlement.result, balance: newPlayerBalance };
        }
        totalDealerDelta -= settlement.amount;

        const outcomeText = settlement.amount > 0 ? `Thắng +$${settlement.amount.toLocaleString()}` : (settlement.amount < 0 ? `Thua -$${Math.abs(settlement.amount).toLocaleString()}` : 'Hòa 🤝');
        updatedLogs.push(`[${time}] Nhà Cái xét bài ${player.name}: ${outcomeText} (${player.score}đ vs ${gs.dealer.score}đ)`);
        if (updatedLogs.length > 50) updatedLogs.shift();
        anySettled = true;
      }

      if (anySettled) {
        updatedLogs.push(`[${time}] ${isAuto ? '[Tự động] ' : ''}Nhà Cái đã hoàn thành XÉT CẢ BÀN 👑`);
        if (updatedLogs.length > 50) updatedLogs.shift();
      }

      // Thực hiện giao dịch tổng cho Nhà cái nếu có thay đổi
      const dealerTxId = `dealer-all-${roundKey}`;
      if (totalDealerDelta !== 0 && gs.dealer.id && !processedTx.includes(dealerTxId)) {
        const type = totalDealerDelta > 0 ? 'win' : 'lose';
        const desc = totalDealerDelta > 0 ? 'Thắng cược tổng từ bàn chơi' : 'Thua cược tổng cho bàn chơi';
        await executeTransaction(gs.dealer.id, totalDealerDelta, type, desc);
        processedTx.push(dealerTxId);
      }

      await updateRemoteState({
        ...gs,
        players: updatedPlayers,
        dealer: { ...gs.dealer, balance: gs.dealer.balance + totalDealerDelta },
        processedTransactions: processedTx,
        actionLogs: updatedLogs,
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

    // Authorization check: only active player or admin can hit
    if (player.id !== profile?.id && !isAdmin) {
      console.warn('[hit] Rejected: Unauthorized hit action');
      return;
    }

    // Time limit check: manual hit is strictly blocked if turn deadline has passed
    if (gs.turnDeadline && Date.now() > gs.turnDeadline) {
      console.warn('[hit] Rejected: Turn deadline has passed');
      alert('Đã hết thời gian lượt chơi của bạn!');
      return;
    }

    if (player.hand.length >= 5) return alert('Đã đạt giới hạn tối đa 5 lá bài!');

    const engine = new XiDachEngine(gs);
    const newState = engine.hit(idx);
    updateRemoteState(newState);
  }, [profile, isAdmin, updateRemoteState]);

  const autoAction = useCallback(async (idx: number) => {
    const gs = gameStateRef.current;
    // Guard: Turn index must match and must not be Dealer (Dealer AFK is handled separately)
    if (idx === -1 || gs.turnIndex !== idx) return;

    // Guard: Prevent concurrent executions of autoAction
    if (isProcessingAutoAction.current) return;

    const player = gs.players[idx];
    if (!player || player.id === '') return; // Guard for empty seats

    // Guard: ignore bots in main source, bots are only activated in tests
    if (player.id.startsWith('00000000-0000-4000-a000-')) return;

    isProcessingAutoAction.current = true;
    try {
      // Khi quá giờ (AFK), luôn tự động Dằn bài (Auto-Stand) để kết thúc lượt, kể cả khi chưa đủ 16 điểm
      logDebug(`Player ${player.name} AFK, performing Auto-Stand`);
      const engine = new XiDachEngine(gs);
      const newState = engine.stand(idx, true); // Bỏ qua mốc 16 điểm khi tự động dằn
      if (newState.actionLogs && newState.actionLogs.length > 0) {
        const lastIdx = newState.actionLogs.length - 1;
        newState.actionLogs[lastIdx] = newState.actionLogs[lastIdx].replace(`${player.name} dằn bài`, `[Tự động] ${player.name} dằn bài`);
      }
      await updateRemoteState(newState);
    } finally {
      isProcessingAutoAction.current = false;
    }
  }, [updateRemoteState]);

  const stand = useCallback(async (idxOrAuto: number | boolean = false) => {
    const gs = gameStateRef.current;
    const isAuto = typeof idxOrAuto === 'number' || idxOrAuto === true;
    const targetIdx = typeof idxOrAuto === 'number' ? idxOrAuto : gs.players.findIndex(p => p.id === profile?.id);

    logDebug('Stand Triggered:', { targetIdx, turnIndex: gs.turnIndex, isAuto, profileId: profile?.id });

    if (targetIdx === -1 || gs.turnIndex !== targetIdx) {
      console.warn('[stand] Rejected: Not your turn or invalid index');
      return;
    }

    const player = gs.players[targetIdx];

    // Authorization check: only active player or admin or automated system (isAuto) can stand
    if (!isAuto && player.id !== profile?.id && !isAdmin) {
      console.warn('[stand] Rejected: Unauthorized manual stand');
      return;
    }

    // Time limit check: manual stand is blocked if turn deadline has passed
    if (!isAuto && gs.turnDeadline && Date.now() > gs.turnDeadline) {
      console.warn('[stand] Rejected: Turn deadline has passed');
      alert('Đã hết thời gian lượt chơi của bạn!');
      return;
    }

    const score = Hand.calculateScore(player.hand);
    const special = Hand.checkSpecialHands(player);
    const isSpecial = special === 'xi_bang' || special === 'xi_dach' || special === 'ngu_linh';

    // Manual stand requires 16 points or special hand
    if (!isAuto && !isSpecial && score < 16) {
      console.warn('[stand] Rejected: Under 16 points (Manual)');
      alert('Bạn phải đủ ít nhất 16 điểm mới được dằn!');
      return;
    }

    logDebug('Executing stand for player', targetIdx, 'score:', score);
    const engine = new XiDachEngine(gs);
    const newState = engine.stand(targetIdx);
    updateRemoteState(newState);
  }, [profile, isAdmin, updateRemoteState]);

  const dealerHit = useCallback((isAuto = false) => {
    const gs = gameStateRef.current;
    if (gs.dealer.id !== profile?.id && !isAuto) return;
    if (gs.dealer.hand.length >= 5) {
      if (!isAuto) alert('Nhà Cái đã đạt giới hạn 5 lá bài!');
      return;
    }

    const score = Hand.calculateScore(gs.dealer.hand);
    if (score >= 28) {
      if (!isAuto) alert('Nhà Cái đã đền bài (>= 28đ), không thể rút thêm!');
      return;
    }

    const activePlayers = gs.players.filter((p) => p.id !== '');
    const allChecked = activePlayers.length > 0 && activePlayers.every((p) => p.isChecked);
    if (allChecked) {
      if (!isAuto) alert('Tất cả người chơi đã được xét, không thể rút thêm bài!');
      return;
    }

    // Time limit check: manual dealer hit is blocked if turn deadline has passed,
    // unless they are under 15 points (chưa đủ tuổi nhà cái) and forced to draw to 15.
    const special = Hand.checkSpecialHands(gs.dealer);
    const isSpecial = special === 'xi_bang' || special === 'xi_dach' || special === 'ngu_linh';
    const isUnderLimit = !isSpecial && score < 15 && gs.dealer.hand.length < 5;

    if (!isAuto && !isUnderLimit && gs.turnDeadline && Date.now() > gs.turnDeadline) {
      console.warn('[dealerHit] Rejected: Turn deadline has passed');
      alert('Đã hết thời gian lượt chơi của bạn!');
      return;
    }

    const engine = new XiDachEngine(gs);
    const newState = engine.dealerHit();
    if (isAuto && newState.actionLogs && newState.actionLogs.length > 0) {
      const lastIdx = newState.actionLogs.length - 1;
      newState.actionLogs[lastIdx] = newState.actionLogs[lastIdx].replace('Nhà Cái rút thêm lá', '[Tự động] Nhà Cái rút thêm lá');
    }
    updateRemoteState(newState);
  }, [profile, updateRemoteState]);

  const resetTableToEmpty = useCallback(async () => {
    await updateRemoteState(createEmptyState());
  }, [updateRemoteState]);

  const refundAllPlayers = useCallback(async (gs: GameState, isAuto = false) => {
    if (!gs.dealer.id) return;
    const processedTx = gs.processedTransactions || [];
    const roundKey = gs.roundId || `reset-${gs.lastActionAt || 0}`;
    let hasChanged = false;

    const updatedLogs = [...(gs.actionLogs || [])];
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    for (const player of gs.players) {
      if (player.id && player.currentBet > 0) {
        const txId = `refund-${player.id}-${roundKey}`;
        if (processedTx.includes(txId)) continue; // Đã refund rồi thì bỏ qua

        try {
          logDebug(`Refunding ${player.currentBet} to ${player.name} (txId: ${txId})`);
          await executeTransaction(player.id, player.currentBet, 'refund', 'Nhà Cái vắng mặt — Hoàn trả tiền cược');
          await executeTransaction(gs.dealer.id, -player.currentBet, 'refund', `Hoàn trả tiền cược cho ${player.name}`);
          processedTx.push(txId);
          hasChanged = true;

          updatedLogs.push(`[${time}] ${isAuto ? '[Tự động] ' : ''}Hoàn trả cược $${player.currentBet.toLocaleString()} cho ${player.name} ↩️`);
          if (updatedLogs.length > 50) updatedLogs.shift();
        } catch (err) {
          console.error('[refundAllPlayers] Failed to refund player', player.id, err);
        }
      }
    }

    if (hasChanged) {
      // Cập nhật lại state với danh sách tx đã xử lý để các client khác biết
      await updateRemoteState({ ...gs, processedTransactions: processedTx, actionLogs: updatedLogs });
    }
  }, [executeTransaction, updateRemoteState]);

  const handleDealerAFK = useCallback(async () => {
    const gs = gameStateRef.current;
    if (gs.dealer.id === '') return;

    // Guard: ignore bots in main source, bots are only activated in tests
    if (gs.dealer.id.startsWith('00000000-0000-4000-a000-')) {
      logDebug(`[AFK Guard] Dealer ${gs.dealer.name} là Bot. Bỏ qua AFK tự động trong source chính.`);
      return;
    }

    if (gs.status === 'ended') {
      logDebug('Phase: ended. Ensuring settlement before reset.');
      await checkAllPlayers(true); // Quyết toán tiền nong cho tất cả trước khi dọn bàn
      await resetTableToEmpty();
    } else if (gs.status === 'betting') {
      logDebug('Phase: betting. Refunding and resetting.');
      await refundAllPlayers(gs, true);
      await resetTableToEmpty();
    } else if (gs.status === 'playing') {
      const activePlayers = gs.players.filter((p) => p.id !== '');
      const allChecked = activePlayers.length > 0 && activePlayers.every((p) => p.isChecked);

      if (allChecked) {
        logDebug('All players already checked. Resetting table.');
        await resetTableToEmpty();
        return;
      }

      const engine = new XiDachEngine(gs);
      const dealer = gs.dealer;
      const res = engine.canDealerCheck(dealer);

      if (res.allowed) {
        logDebug('Anti-Cheat: Auto-checking all players.');
        await checkAllPlayers(true);
      } else {
        logDebug('Anti-Cheat: Auto-hitting for Dealer.');
        await dealerHit(true);
      }
    }
  }, [resetTableToEmpty, refundAllPlayers, checkAllPlayers, dealerHit]);

  const handlePlayerAFK = useCallback(async (idx: number, allPresent: PresenceUser[]) => {
    const gs = gameStateRef.current;
    if (gs.turnIndex !== idx) return;

    const player = gs.players[idx];
    if (!player.id) return;

    // Guard: ignore bots in main source, bots are only activated in tests
    if (player.id.startsWith('00000000-0000-4000-a000-')) {
      logDebug(`[AFK Guard] Player ${player.name} là Bot. Bỏ qua AFK tự động trong source chính.`);
      return;
    }

    const isOffline = !allPresent.some(u => u.id === player.id);
    const processedTx = gs.processedTransactions || [];
    const roundKey = gs.roundId || `afk-${gs.lastActionAt || 0}`;
    const penaltyTxId = `penalty-${player.id}-${roundKey}`;

    if (isOffline && gs.status === 'playing' && player.hand.length > 0 && !player.isChecked && !processedTx.includes(penaltyTxId)) {
      logDebug(`Player ${player.name} is OFFLINE (txId: ${penaltyTxId}). Penalizing Rage Quit.`);
      const bet = player.currentBet;
      try {
        await executeTransaction(player.id, -bet, 'penalty', 'Phạt thoát ván bài (AFK Offline)');
        if (gs.dealer.id) {
          await executeTransaction(gs.dealer.id, bet, 'win', `Nhà Cái hưởng tiền phạt từ ${player.name} (AFK)`);
        }

        // Mark as processed
        processedTx.push(penaltyTxId);

        // Kick player and advance turn
        const engine = new XiDachEngine(gs);
        let newState = engine.kickPlayer(idx);

        const updatedLogs = [...(newState.actionLogs || [])];
        const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        updatedLogs.push(`[${time}] ⚠️ ${player.name} bị phạt Rage Quit/AFK -$${bet.toLocaleString()} 💸`);
        if (updatedLogs.length > 50) updatedLogs.shift();
        newState.actionLogs = updatedLogs;

        // Sau khi kích, cần chuyển lượt vì đang là lượt của họ
        const nextState = getNextTurnState(newState);
        updateRemoteState({ ...nextState, processedTransactions: processedTx });
      } catch (err) {
        console.error('[handlePlayerAFK] Penalty transaction failed:', err);
      }
    } else {
      // Vẫn online: thực hiện autoAction bình thường (Hit/Stand)
      logDebug(`Player ${player.name} is online. Performing normal Auto-Action.`);
      await autoAction(idx);
    }
  }, [executeTransaction, autoAction, updateRemoteState, getNextTurnState]);

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
      autoAction,
      handleDealerAFK,
      handlePlayerAFK,
    },
  };
}
