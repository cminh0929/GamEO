'use client';

import React from 'react';
import { CardType } from '../../types/game';

const suitSymbols = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const Card: React.FC<{ card: CardType; index?: number }> = ({ card, index }) => {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  
  if (!card.isRevealed) {
    return <div className="card back card-deal" style={{ animationDelay: `${(index || 0) * 0.1}s` }} />;
  }

  return (
    <div 
      className={`card ${isRed ? 'red' : 'black'} card-deal`}
      style={{ animationDelay: `${(index || 0) * 0.1}s` }}
    >
      <div className="rank">{card.rank}</div>
      <div className="suit">{suitSymbols[card.suit]}</div>
      <div className="center-suit">{suitSymbols[card.suit]}</div>
    </div>
  );
};
