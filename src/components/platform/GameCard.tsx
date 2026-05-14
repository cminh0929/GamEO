'use client';

import React from 'react';
import Link from 'next/link';
import type { GameMenuItem } from '../../types/platform';

interface GameCardProps {
  game: GameMenuItem;
}

export function GameCard({ game }: GameCardProps) {
  const isLive = game.status === 'live';

  const cardContent = (
    <div className={`game-card ${isLive ? 'game-card--live' : 'game-card--soon'}`}>
      <div className="game-card-badge">{game.badge}</div>
      <div className="game-card-icon">{game.icon}</div>
      <div className="game-card-body">
        <h2 className="game-card-title">{game.name}</h2>
        <p className="game-card-desc">{game.description}</p>
        <div className="game-card-meta">
          {game.maxPlayers && (
            <span className="meta-tag">👥 Tối đa {game.maxPlayers} người</span>
          )}
          <span className="meta-tag">💵 Cược tối thiểu: {game.minBet.toLocaleString()}đ</span>
        </div>
      </div>
      <div className="game-card-action">
        {isLive ? (
          <span className="btn-play-now">CHƠI NGAY →</span>
        ) : (
          <span className="btn-coming-soon">SẮP RA MẮT</span>
        )}
      </div>
    </div>
  );

  if (isLive) {
    return <Link href={`/games/${game.slug}`} className="game-card-link">{cardContent}</Link>;
  }

  return <div className="game-card-link">{cardContent}</div>;
}
