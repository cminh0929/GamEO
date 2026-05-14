'use client';

import React from 'react';
import { GameCard } from '../components/platform/GameCard';
import { GAME_MENU } from '../lib/constants';

export default function LobbyPage() {
  return (
    <main className="lobby-container">
      {/* Hero */}
      <section className="lobby-hero">
        <div className="lobby-hero-badge">🏆 PREMIUM CASINO</div>
        <h1 className="lobby-hero-title">GAMEO CASINO</h1>
        <p className="lobby-hero-sub">Chọn trò chơi của bạn. Tốt vận luôn bên bạn.</p>
      </section>

      {/* Game grid */}
      <section className="lobby-games">
        <h2 className="lobby-section-title">🎮 KHO GAME</h2>
        <div className="game-grid">
          {GAME_MENU.map((game) => (
            <GameCard key={game.slug} game={game} />
          ))}
        </div>
      </section>

      {/* Footer note */}
      <footer className="lobby-footer">
        <p>GAMEO Casino — Chỉ dành cho mục đích giải trí. Chơi có trách nhiệm.</p>
      </footer>
    </main>
  );
}
