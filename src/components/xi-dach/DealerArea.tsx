'use client';

import React from 'react';
import { Card } from '../ui/Card';
import { Hand } from '../../lib/game/Hand';
import type { Player, GameState } from '../../types/game';
import type { Profile } from '../../types/platform';

interface DealerAreaProps {
  dealer: Player;
  gameState: GameState;
  profile: Profile | null;
  chatBubble?: string;
  onDealerHit: () => void;
  onResetTable: () => void;
  onTakeDealer: () => void;
  onKick: (index: 'dealer') => void;
  isAdmin?: boolean;
}

export function DealerArea({
  dealer, gameState, profile, chatBubble, onDealerHit, onResetTable, onTakeDealer, onKick, isAdmin,
}: DealerAreaProps) {
  const [anim, setAnim] = React.useState<{ amount: number; key: number } | null>(null);
  const prevBalance = React.useRef(dealer.balance);

  React.useEffect(() => {
    const diff = dealer.balance - prevBalance.current;
    if (diff !== 0 && dealer.id !== '') {
      setAnim({ amount: diff, key: Date.now() });
      setTimeout(() => setAnim(null), 1500);
    }
    prevBalance.current = dealer.balance;
  }, [dealer.balance]);

  const isDealer = dealer.id === profile?.id;
  const isMeChecked = gameState.players.some((p) => p.id === profile?.id && p.isChecked);
  const notSeated = !gameState.players.some((p) => p.id === profile?.id) && dealer.id !== profile?.id;

  return (
    <div className="dealer-area">
      {/* Money Animation */}
      {anim && (
        <div key={anim.key} className={`money-anim ${anim.amount > 0 ? 'plus' : 'minus'}`}>
          {anim.amount > 0 ? `+${anim.amount.toLocaleString()}` : anim.amount.toLocaleString()}
        </div>
      )}
      {/* Dealer speech bubble */}
      {chatBubble && dealer.id !== '' && (
        <div className="seat-bubble dealer-bubble">{chatBubble}</div>
      )}
      <div className="dealer-info">
        {dealer.avatarUrl && (
          <img src={dealer.avatarUrl} alt="Dealer" className="dealer-avatar" />
        )}
        {dealer.id ? (
          <>
            <span className="dealer-balance">${(dealer.balance ?? 0).toLocaleString()}</span>
            <span className="dealer-name">{dealer.name}</span>
            {isAdmin && dealer.id !== profile?.id && (
              <button
                className="btn-kick dealer-kick"
                onClick={(e) => { e.stopPropagation(); onKick('dealer'); }}
                title="Admin Kick Dealer"
                style={{ marginLeft: '8px', padding: '2px 6px', fontSize: '12px' }}
              >❌</button>
            )}
          </>
        ) : (
          <>
            <span className="dealer-name empty">ĐANG TRỐNG</span>
            {notSeated && (
              <button className="btn-sit dealer" onClick={onTakeDealer}>
                LÀM NHÀ CÁI 👑
              </button>
            )}
          </>
        )}
      </div>

      <div className="hand">
        {dealer.hand.map((card, i) => {
          const isVisible = isDealer || gameState.status === 'ended' || isMeChecked;
          return (
            <Card key={i} card={isVisible ? card : { ...card, isRevealed: false }} index={i} />
          );
        })}
      </div>

      {isDealer && (
        <div className="dealer-controls">
          {gameState.status === 'playing' && gameState.turnIndex === -1 && (
            <button className="btn-action hit" onClick={onDealerHit}>Rút bài</button>
          )}
          {gameState.status !== 'playing' && (
            <button className="btn-action reset" onClick={onResetTable}>Làm mới bàn</button>
          )}
        </div>
      )}
    </div>
  );
}
