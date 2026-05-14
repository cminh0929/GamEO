'use client';

import React, { useEffect, useRef } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useTransactions } from '../../../hooks/useTransactions';
import { useXiDachRoom } from '../../../hooks/useXiDachRoom';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { useTabGuard } from '../../../hooks/useTabGuard';
import { AuthGuard } from '../../../components/platform/AuthGuard';
import { DealerArea } from '../../../components/xi-dach/DealerArea';
import { PlayerSeat } from '../../../components/xi-dach/PlayerSeat';

export const dynamic = 'force-dynamic';

const ROOM_ID = 'gameo-table-1';

// ─── Blocked Tab Screen ───────────────────────────────────────────────────────
function BlockedTabScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#050505', gap: '1rem',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ fontSize: '3rem' }}>⚠️</div>
      <h2 style={{ color: '#d4af37', fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
        GAMEO đang mở ở tab khác
      </h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, textAlign: 'center', maxWidth: 360 }}>
        Bạn đang chơi ở một cửa sổ/tab khác. Vui lòng đóng tab này để tránh xung đột dữ liệu.
      </p>
      <button
        onClick={() => window.close()}
        style={{
          marginTop: '1rem',
          padding: '12px 28px',
          background: 'linear-gradient(135deg, #d4af37, #b8860b)',
          color: '#000', border: 'none', borderRadius: 12,
          fontWeight: 800, fontSize: '1rem', cursor: 'pointer',
        }}
      >
        Đóng tab này
      </button>
    </div>
  );
}

// ─── Main Game Page ───────────────────────────────────────────────────────────
function XiDachGame() {
  const { session, profile } = useAuth();
  const { logs, executeTransaction } = useTransactions(session?.user.id);
  const { gameState, actions } = useXiDachRoom(profile, executeTransaction);
  const { isBlocked } = useTabGuard(session?.user.id ?? null, ROOM_ID);
  const { timeLeft, idleTimeLeft } = useGameTimer({
    gameState,
    profile,
    stand: actions.stand,
    isBlocked,
  });

  // ── beforeunload: auto-leave when closing tab mid-game ──────────────────
  const actionsRef = useRef(actions);
  const profileRef = useRef(profile);
  const gameStateRef = useRef(gameState);
  useEffect(() => { actionsRef.current = actions; }, [actions]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const gs = gameStateRef.current;
      const p = profileRef.current;
      if (!p) return;

      const isSeated =
        gs.dealer.id === p.id ||
        gs.players.some((pl) => pl.id === p.id);

      // Fire-and-forget leave — can't await in beforeunload
      if (isSeated) {
        actionsRef.current.leaveRole();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ── Blocked tab overlay ──────────────────────────────────────────────────
  if (isBlocked) return <BlockedTabScreen />;

  return (
    <main className="casino-container">
      {/* Bàn chơi chính (Oval) */}
      <div className="casino-table">
        {/* Thảm xanh trung tâm */}
        <div className="table-felt">
          <div className="felt-inner">
            <div className="table-logo">GAMEO PREMIUM</div>

            {/* Nhà Cái */}
            <DealerArea
              dealer={gameState.dealer}
              gameState={gameState}
              profile={profile}
              onDealerHit={actions.dealerHit}
              onResetTable={actions.resetTableToEmpty}
              onTakeDealer={() => actions.takeRole('dealer')}
            />

            {/* Game Status */}
            <div className="game-status-msg">
              {gameState.status === 'betting' && '⌛ ĐANG ĐẶT CƯỢC...'}
              {gameState.status === 'playing' && (
                gameState.turnIndex === -1 ? '👑 LƯỢT NHÀ CÁI' : '🎴 LƯỢT NGƯỜI CHƠI'
              )}
            </div>
          </div>
        </div>

        {/* 7 Ghế người chơi */}
        {gameState.players.map((player, idx) => (
          <PlayerSeat
            key={idx}
            player={player}
            index={idx}
            gameState={gameState}
            profile={profile}
            timeLeft={timeLeft}
            onSit={(i) => actions.takeRole('player', i)}
            onKick={actions.kickPlayer}
            onPlaceBet={actions.placeBet}
            onHit={actions.hit}
            onStand={actions.stand}
            onCheckPlayer={actions.checkPlayer}
          />
        ))}
      </div>

      {/* Sidebar giao dịch */}
      <div className="transaction-sidebar">
        <h3>📜 GIAO DỊCH</h3>
        <div className="log-list">
          {logs.map((log) => (
            <div key={log.id} className="log-item">
              <span className={log.amount > 0 ? 'pos' : 'neg'}>
                {log.amount > 0 ? '+' : ''}{log.amount.toLocaleString()}
              </span>
              <p>{log.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="bottom-controls">
        {gameState.dealer.id === profile?.id && (
          <button className="btn-main" onClick={actions.startNewGame}>
            {gameState.status === 'ended'
              ? 'BẮT ĐẦU VÁN MỚI'
              : gameState.status === 'betting'
                ? 'CHIA BÀI'
                : 'RESET VÁN'}
          </button>
        )}
        {profile && (
          <button className="btn-leave" onClick={actions.leaveRole}>Rời bàn</button>
        )}
      </div>

      {/* Idle timer warning */}
      {gameState.dealer.id !== '' && idleTimeLeft < 30 && (
        <div className="idle-timer">
          ⚠️ Nhà Cái vắng mặt? Tự thoát sau {idleTimeLeft}s
        </div>
      )}
    </main>
  );
}

// ─── Exported Page — wrapped with AuthGuard ───────────────────────────────────
export default function XiDachPage() {
  return (
    <AuthGuard>
      <XiDachGame />
    </AuthGuard>
  );
}
