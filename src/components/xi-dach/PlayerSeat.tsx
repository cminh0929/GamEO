'use client';

import React from 'react';
import { Card } from '../ui/Card';
import { Hand } from '../../lib/game/Hand';
import type { Player, GameState } from '../../types/game';
import type { Profile } from '../../types/platform';

interface PlayerSeatProps {
  player: Player;
  index: number;
  gameState: GameState;
  profile: Profile | null;
  timeLeft: number;
  chatBubble?: string;
  onSit: (index: number) => void;
  onKick: (index: number) => void;
  onPlaceBet: (index: number, amount: number) => void;
  onHit: (index: number) => void;
  onStand: (index: number) => void;
  onCheckPlayer: (index: number) => void;
  isAdmin?: boolean;
}

export function PlayerSeat({
  player, index, gameState, profile, timeLeft, chatBubble,
  onSit, onKick, onPlaceBet, onHit, onStand, onCheckPlayer, isAdmin,
}: PlayerSeatProps) {
  const isMe = player.id === profile?.id;
  const isMyTurn = gameState.status === 'playing' && gameState.turnIndex === index && player.id !== '';
  const isDealer = gameState.dealer.id === profile?.id;
  const notSeated = !gameState.players.some((p) => p.id === profile?.id) && gameState.dealer.id !== profile?.id;
  const dealerScore = Hand.calculateScore(gameState.dealer.hand);

  const isVisible = isMe || player.isChecked || gameState.status === 'ended';

  return (
    <div
      className={[
        'player-box',
        `seat-${index}`,
        isMe ? 'is-me' : '',
        isMyTurn ? 'active-turn' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Speech bubble */}
      {chatBubble && player.id !== '' && (
        <div className="seat-bubble">{chatBubble}</div>
      )}
      {/* Header: avatar, name, timer, kick */}
      <div className="player-header">
        {player.avatarUrl && (
          <img src={player.avatarUrl} alt="Avt" className="player-avatar-img" />
        )}
        <span className="name">{player.name}</span>
        {isMyTurn && <span className="timer">{timeLeft}s</span>}
        {(isDealer || isAdmin) && player.id !== '' && player.id !== profile?.id && (
          <button
            className="btn-kick"
            onClick={(e) => { e.stopPropagation(); onKick(index); }}
            title={isAdmin ? "Admin Kick" : "Kick"}
          >❌</button>
        )}
      </div>

      {/* Hand */}
      <div className="hand">
        {player.hand.length > 0
          ? player.hand.map((card, i) => (
            <Card
              key={i}
              card={isVisible ? card : { ...card, isRevealed: false }}
              index={i}
            />
          ))
          : player.id !== '' && (
            <div className="waiting-text">
              {gameState.status === 'betting' ? 'Đặt cược...' : 'Chờ ván...'}
            </div>
          )}
      </div>

      {/* Score / Special hand */}
      {player.hand.length > 0 && isVisible && (
        <div className="score-pill">
          {(() => {
            const special = Hand.checkSpecialHands(player);
            if (special && special !== player.status) {
              return special.toString().toUpperCase().replace('_', ' ');
            }
            const s = Hand.calculateScore(player.hand);
            return s > 21 ? `QUẮC (${s})` : `${s} ĐIỂM`;
          })()}
        </div>
      )}

      {/* Footer: bet, actions */}
      <div className="player-footer">
        {player.id === '' ? (
          notSeated && (
            <button className="btn-sit" onClick={() => onSit(index)}>Ngồi đây</button>
          )
        ) : (
          <>
            <div className="bet-display">${(player.currentBet ?? 0).toLocaleString()}</div>

            {isMe && gameState.status === 'betting' && (
              <input
                type="number"
                className="bet-input"
                placeholder="Cược..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onPlaceBet(index, parseInt((e.target as HTMLInputElement).value));
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                onBlur={(e) => onPlaceBet(index, parseInt(e.target.value))}
              />
            )}

            {isMe && isMyTurn && (
              <div className="action-row">
                <button className="btn-mini hit" onClick={() => onHit(index)}>Rút</button>
                <button className="btn-mini stand" onClick={() => onStand(index)}>Dừng</button>
              </div>
            )}

            {isDealer && player.hand.length > 0 && !player.isChecked && (
              <button
                className="btn-mini check"
                onClick={() => onCheckPlayer(index)}
                disabled={
                  (dealerScore < 15 && gameState.dealer.hand.length < 5) ||
                  player.status === 'playing'
                }
              >
                XÉT
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
