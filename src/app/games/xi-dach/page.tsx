'use client';

import React, { useEffect, useRef } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useTransactions } from '../../../hooks/useTransactions';
import { useXiDachRoom } from '../../../hooks/useXiDachRoom';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { useTabGuard } from '../../../hooks/useTabGuard';
import { useSpectators } from '../../../hooks/useSpectators';
import { useChat } from '../../../hooks/useChat';
import { AuthGuard } from '../../../components/platform/AuthGuard';
import { DealerArea } from '../../../components/xi-dach/DealerArea';
import { PlayerSeat } from '../../../components/xi-dach/PlayerSeat';
import { SpectatorPanel } from '../../../components/xi-dach/SpectatorPanel';
import { ChatPanel } from '../../../components/xi-dach/ChatPanel';

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
  const { session, profile, isAdmin } = useAuth();
  const { logs, executeTransaction, refreshLogs } = useTransactions(session?.user.id);
  const { gameState, actions } = useXiDachRoom(profile, executeTransaction, refreshLogs, isAdmin);
  const { isBlocked } = useTabGuard(session?.user.id ?? null, ROOM_ID);
  const { timeLeft, idleTimeLeft } = useGameTimer({
    gameState,
    profile,
    stand: actions.stand,
    isBlocked,
  });

  const mePresence = profile ? { id: profile.id, name: profile.username, avatarUrl: profile.avatar_url ?? undefined } : null;
  const { spectators, allPresent } = useSpectators(ROOM_ID, mePresence, gameState);
  const { messages: chatMessages, sendMessage, bubbles } = useChat(ROOM_ID, mePresence);
  const [showLogs, setShowLogs] = React.useState(false);

  // Show "XÉT TẤT CẢ" when all seated players have finished their turns
  const isDealer = gameState.dealer.id === profile?.id;
  const seatedPlayers = gameState.players.filter((p) => p.id !== '');
  const allPlayersDone = seatedPlayers.length > 0 &&
    seatedPlayers.every((p) => p.status === 'stay' || p.status === 'bust') &&
    seatedPlayers.some((p) => !p.isChecked);
  const showCheckAll = isDealer && gameState.status === 'playing' && gameState.turnIndex === -1 && allPlayersDone;

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

  // ── Idle auto-kick: khi dealer vắng mặt quá 60s, người chơi đầu tiên reset bàn ──
  useEffect(() => {
    if (idleTimeLeft !== 0) return;
    if (!profile) return;
    if (gameState.dealer.id === '') return;
    if (gameState.dealer.id === profile.id) return; // dealer tự kỳ nên kông tự kick
    // Chỉ cho 1 client trigger (người chơi ở vị trí 0 hoặc player đầu tiên)
    const firstSeated = gameState.players.find((p) => p.id !== '');
    if (firstSeated?.id !== profile.id) return;
    actions.resetTableToEmpty();
  }, [idleTimeLeft, profile, gameState.dealer.id, gameState.players, actions]);

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
              chatBubble={bubbles[gameState.dealer.id]}
              onDealerHit={actions.dealerHit}
              onResetTable={actions.resetTableToEmpty}
              onTakeDealer={() => actions.takeRole('dealer')}
              onKick={actions.kickPlayer}
              isAdmin={isAdmin}
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
            chatBubble={bubbles[player.id]}
            onSit={(i) => actions.takeRole('player', i)}
            onKick={actions.kickPlayer}
            onPlaceBet={actions.placeBet}
            onHit={actions.hit}
            onStand={actions.stand}
            onCheckPlayer={actions.checkPlayer}
            isAdmin={isAdmin}
          />
        ))}
      </div>

      {/* Sidebar giao dịch - Toggleable on mobile */}
      <div className={`transaction-sidebar ${showLogs ? 'is-open' : ''}`}>
        <div className="sidebar-header">
          <h3>📜 GIAO DỊCH</h3>
          <button className="btn-close-sidebar" onClick={() => setShowLogs(false)}>×</button>
        </div>
        <div className="log-list">
          {logs.map((log) => (
            <div key={log.id} className="log-item">
              <span className={log.amount > 0 ? 'pos' : 'neg'}>
                {log.amount > 0 ? '+' : ''}{(log.amount ?? 0).toLocaleString()}
              </span>
              <p>{log.description}</p>
            </div>
          ))}
        </div>
      </div>

      <button className="btn-toggle-logs" onClick={() => setShowLogs(!showLogs)}>
        📜
      </button>

      {/* Bottom controls */}
      <div className="bottom-controls">
        {showCheckAll && (
          <button className="btn-main" style={{ background: 'linear-gradient(135deg,#e74c3c,#c0392b)' }} onClick={actions.checkAllPlayers}>
            ⚖️ XÉT TẤT CẢ
          </button>
        )}
        {gameState.dealer.id === profile?.id && !showCheckAll && (
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

      {/* Idle timer warning — chỉ hiện với người không phải dealer */}
      {gameState.dealer.id !== '' && !isDealer && idleTimeLeft < 30 && (
        <div className="idle-timer">
          ⚠️ Nhà Cái vắng mặt — bàn tự reset sau {idleTimeLeft}s
        </div>
      )}

      {/* Version badge */}
      <div className="version-badge">v1.0.3</div>

      {/* Spectator drawer */}
      <SpectatorPanel spectators={spectators} allPresent={allPresent} />

      {/* Chat drawer */}
      <ChatPanel messages={chatMessages} onSend={sendMessage} myId={profile?.id ?? null} />
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
