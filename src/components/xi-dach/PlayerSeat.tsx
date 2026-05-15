'use client';

import React from 'react';
import { Card } from '../ui/Card';
import { Hand } from '../../lib/game/Hand';
import { XiDachEngine } from '../../lib/game/XiDachEngine';
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
  const [anim, setAnim] = React.useState<{ amount: number; key: number } | null>(null);
  const prevChecked = React.useRef(player.isChecked);

  React.useEffect(() => {
    if (player.isChecked && !prevChecked.current && player.id !== '') {
      // Tính toán tiền thắng thua để show animation
      const res = XiDachEngine.calculateResult(player, gameState.dealer);
      let amount = 0;
      if (res.result === 'win') amount = player.currentBet * res.multiplier;
      else if (res.result === 'lose') amount = -player.currentBet * res.multiplier;
      
      if (amount !== 0) {
        setAnim({ amount, key: Date.now() });
        setTimeout(() => setAnim(null), 1500);
      }
    }
    prevChecked.current = player.isChecked;
  }, [player.isChecked, player.gameResult]);

  const isMe = player.id === profile?.id;
  const isMyTurn = gameState.status === 'playing' && gameState.turnIndex === index && player.id !== '';
  const isDealer = gameState.dealer.id === profile?.id;
  const notSeated = !gameState.players.some((p) => p.id === profile?.id) && gameState.dealer.id !== profile?.id;
  const dealerScore = Hand.calculateScore(gameState.dealer.hand);

  const isBottomSeat = index >= 3 && index <= 5;
  const isVisible = isMe || player.isChecked || gameState.status === 'ended';

  return (
    <div
      className={[
        'player-box',
        `seat-${index}`,
        isMe ? 'is-me' : '',
        isMyTurn ? 'active-turn' : '',
        isBottomSeat ? 'is-bottom' : 'is-top',
      ].filter(Boolean).join(' ')}
    >
      {/* Money Animation */}
      {anim && (
        <div key={anim.key} className={`money-anim ${anim.amount > 0 ? 'plus' : 'minus'}`}>
          {anim.amount > 0 ? `+${anim.amount.toLocaleString()}` : anim.amount.toLocaleString()}
        </div>
      )}

      {/* Pop-up chat top for top seats */}
      {!isBottomSeat && chatBubble && player.id !== '' && (
        <div className="seat-bubble">{chatBubble}</div>
      )}

      {/* Header (Balance + Name + Timer) at TOP for top seats */}
      {!isBottomSeat && player.id !== '' && (
        <div className="player-header">
          <div className="player-info-column">
            <span className="balance">${(player.balance ?? 0).toLocaleString()}</span>
            <div className="name-row">
              {player.avatarUrl && (
                <img src={player.avatarUrl} alt="Avt" className="player-avatar-img" />
              )}
              <span className="name">{player.name}</span>
            </div>
          </div>
          <div className="header-actions">
            {isMyTurn && <span className="timer">{timeLeft}s</span>}
            {(isDealer || isAdmin) && player.id !== '' && player.id !== profile?.id && (
              <button
                className="btn-kick"
                onClick={(e) => { e.stopPropagation(); onKick(index); }}
                title={isAdmin ? "Admin Kick" : "Kick"}
              >❌</button>
            )}
          </div>
        </div>
      )}

      {/* Seat trigger for empty seats at TOP for top seats */}
      {!isBottomSeat && player.id === '' && notSeated && (
        <button className="btn-sit top" onClick={() => onSit(index)}>Ngồi đây</button>
      )}

      {/* Hand area remains central */}
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

      {/* Action buttons / Bet display */}
      <div className="player-footer">
        {player.id !== '' && (
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

      {/* Header (Name + Balance) at BOTTOM for bottom seats (3, 4, 5) */}
      {isBottomSeat && player.id !== '' && (
        <div className="player-header bottom">
          <div className="header-actions top">
             {isMyTurn && <span className="timer">{timeLeft}s</span>}
             {(isDealer || isAdmin) && player.id !== '' && player.id !== profile?.id && (
               <button
                 className="btn-kick"
                 onClick={(e) => { e.stopPropagation(); onKick(index); }}
                 title={isAdmin ? "Admin Kick" : "Kick"}
               >❌</button>
             )}
          </div>
          <div className="player-info-column">
            <div className="name-row">
              {player.avatarUrl && (
                <img src={player.avatarUrl} alt="Avt" className="player-avatar-img" />
              )}
              <span className="name">{player.name}</span>
            </div>
            <span className="balance">${(player.balance ?? 0).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Seat trigger for empty seats at BOTTOM for bottom seats */}
      {isBottomSeat && player.id === '' && notSeated && (
        <button className="btn-sit bottom" onClick={() => onSit(index)}>Ngồi đây</button>
      )}

      {/* Pop-up chat at BOTTOM for bottom seats */}
      {isBottomSeat && chatBubble && player.id !== '' && (
        <div className="seat-bubble bottom-bubble">{chatBubble}</div>
      )}
    </div>
  );
}
