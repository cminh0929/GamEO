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
  onDealerHit: () => void;
  onResetTable: () => void;
  onTakeDealer: () => void;
}

export function DealerArea({
  dealer, gameState, profile, onDealerHit, onResetTable, onTakeDealer,
}: DealerAreaProps) {
  const isDealer = dealer.id === profile?.id;
  const isMeChecked = gameState.players.some((p) => p.id === profile?.id && p.isChecked);
  const notSeated = !gameState.players.some((p) => p.id === profile?.id) && dealer.id !== profile?.id;

  return (
    <div className="dealer-area">
      <div className="dealer-info">
        {dealer.avatarUrl && (
          <img src={dealer.avatarUrl} alt="Dealer" className="dealer-avatar" />
        )}
        <span className={dealer.id ? 'dealer-name' : 'dealer-name empty'}>
          {dealer.id ? dealer.name : 'ĐANG TRỐNG'}
        </span>
        {dealer.id ? (
          <span className="dealer-balance">${dealer.balance.toLocaleString()}</span>
        ) : (
          notSeated && (
            <button className="btn-sit dealer" onClick={onTakeDealer}>
              LÀM NHÀ CÁI 👑
            </button>
          )
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
