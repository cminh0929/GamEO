'use client';

import React from 'react';
import type { Metadata } from 'next';
import { useAuth } from '../../../hooks/useAuth';
import { useTransactions } from '../../../hooks/useTransactions';
import { useXiDachRoom } from '../../../hooks/useXiDachRoom';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { DealerArea } from '../../../components/xi-dach/DealerArea';
import { PlayerSeat } from '../../../components/xi-dach/PlayerSeat';

export const dynamic = 'force-dynamic';

export default function XiDachPage() {
  const { session, profile } = useAuth();
  const { logs, executeTransaction } = useTransactions(session?.user.id);
  const { gameState, actions } = useXiDachRoom(profile, executeTransaction);
  const { timeLeft, idleTimeLeft } = useGameTimer({
    gameState,
    profile,
    stand: actions.stand,
  });

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
