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
    stand: actions.autoAction,
    isBlocked,
  });

  const mePresence = profile ? { id: profile.id, name: profile.username, avatarUrl: profile.avatar_url ?? undefined } : null;
  const { spectators, allPresent } = useSpectators(ROOM_ID, mePresence, gameState);
  const { messages: chatMessages, sendMessage, bubbles } = useChat(ROOM_ID, mePresence);
  const [showLogs, setShowLogs] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'transactions' | 'actions'>('actions');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showLogs && activeTab === 'actions') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameState.actionLogs, showLogs, activeTab]);

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

  // ── Idle auto-kick & Player AFK handler ──
  useEffect(() => {
    if (timeLeft > 0 && idleTimeLeft > 0) return;
    if (!profile) return;

    const now = Date.now();
    const elapsedSinceLastAction = now - (gameState.lastActionAt || now);

    // 1. Xử lý Nhà Cái AFK (idleTimeLeft === 0)
    // Chỉ kích hoạt nếu thực sự đã trôi qua ít nhất 58 giây kể từ hành động cuối
    if (idleTimeLeft === 0 && gameState.dealer.id !== '' && elapsedSinceLastAction >= 58000) {
      // Ưu tiên chọn người đang Online (có trong allPresent) làm người xử lý
      const firstOnlineSeated = gameState.players.find((p) => p.id !== '' && allPresent.some(u => u.id === p.id));
      const firstSpectator = allPresent.find(u => u.id !== gameState.dealer.id && !gameState.players.some(p => p.id === u.id));
      const triggerId = firstOnlineSeated ? firstOnlineSeated.id : (firstSpectator?.id || allPresent[0]?.id);
      
      if (triggerId === profile.id) {
        console.log('[page] Bạn là người xử lý Nhà Cái AFK. Đang thực thi...');
        actions.handleDealerAFK();
      }
    }

    // 2. Xử lý Người chơi AFK hết lượt (timeLeft === 0)
    // Chỉ kích hoạt nếu thực sự đã trôi qua ít nhất 28 giây kể từ hành động cuối
    if (timeLeft === 0 && gameState.status === 'playing' && gameState.turnIndex !== -1 && elapsedSinceLastAction >= 28000) {
      const currentPlayer = gameState.players[gameState.turnIndex];
      // Nếu người chơi AFK không phải là tôi, tôi có thể là "trọng tài" để thúc lượt của họ
      if (currentPlayer && currentPlayer.id !== '' && currentPlayer.id !== profile.id) {
        // Trọng tài ưu tiên: Nhà cái, nếu không có thì là người đầu tiên trong danh sách online
        const triggerId = gameState.dealer.id || allPresent[0]?.id;
        if (triggerId === profile.id) {
          console.log(`[page] Bạn là trọng tài xử lý AFK cho Vị trí ${gameState.turnIndex + 1}.`);
          actions.handlePlayerAFK(gameState.turnIndex, allPresent);
        }
      }
    }
  }, [timeLeft, idleTimeLeft, profile, gameState, allPresent, actions]);

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
      <div className={`transaction-sidebar ${showLogs ? 'is-open' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📋 LỊCH SỬ BÀN</h3>
            <button className="btn-close-sidebar" onClick={() => setShowLogs(false)}>×</button>
          </div>
          <div className="tab-selectors" style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px' }}>
            <button
              onClick={() => setActiveTab('actions')}
              style={{
                flex: 1,
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'actions' ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: activeTab === 'actions' ? '#fff' : '#aaa',
                fontWeight: activeTab === 'actions' ? '700' : '400',
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              ⚡ DIỄN BIẾN
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              style={{
                flex: 1,
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'transactions' ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: activeTab === 'transactions' ? '#fff' : '#aaa',
                fontWeight: activeTab === 'transactions' ? '700' : '400',
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              💵 GIAO DỊCH
            </button>
          </div>
        </div>
        <div className="log-list" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
          {activeTab === 'transactions' ? (
            logs.length === 0 ? (
              <div style={{ color: '#666', textAlign: 'center', padding: '20px 0', fontSize: '0.9rem' }}>Chưa có giao dịch nào</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="log-item" style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', borderLeft: log.amount > 0 ? '3px solid #4ade80' : '3px solid #f87171' }}>
                  <span className={log.amount > 0 ? 'pos' : 'neg'} style={{ fontWeight: 800, color: log.amount > 0 ? '#4ade80' : '#f87171', display: 'block', fontSize: '0.95rem' }}>
                    {log.amount > 0 ? '+' : ''}{(log.amount ?? 0).toLocaleString()} xu
                  </span>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#ccc', lineHeight: '1.3' }}>{log.description}</p>
                </div>
              ))
            )
          ) : (
            !gameState.actionLogs || gameState.actionLogs.length === 0 ? (
              <div style={{ color: '#666', textAlign: 'center', padding: '20px 0', fontSize: '0.9rem' }}>Chưa có diễn biến nào</div>
            ) : (
              gameState.actionLogs.map((actionLog, index) => {
                // Highlight critical events (Win/Lose/Bust/Dealer/System Warning)
                let isWarning = actionLog.includes('⚠️');
                let isSpecial = actionLog.includes('XÌ BÀNG') || actionLog.includes('XÌ DÁCH') || actionLog.includes('Ngũ Linh');
                let isWin = actionLog.includes('Thắng');
                let isLose = actionLog.includes('Thua');

                let itemBg = 'rgba(255,255,255,0.02)';
                let borderLeft = '3px solid rgba(255,255,255,0.1)';
                if (isWarning) { itemBg = 'rgba(239, 68, 68, 0.05)'; borderLeft = '3px solid #ef4444'; }
                else if (isSpecial) { itemBg = 'rgba(212, 175, 55, 0.05)'; borderLeft = '3px solid #d4af37'; }
                else if (isWin) { borderLeft = '3px solid #4ade80'; }
                else if (isLose) { borderLeft = '3px solid #f87171'; }

                return (
                  <div key={index} style={{
                    background: itemBg,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    borderLeft: borderLeft,
                    fontSize: '0.85rem',
                    color: isSpecial ? '#ffe082' : '#eee',
                    lineHeight: '1.4',
                    fontFamily: 'monospace',
                    animation: 'fadeIn 0.2s ease-out'
                  }}>
                    {actionLog}
                  </div>
                );
              })
            )
          )}
          <div ref={logEndRef} />
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
