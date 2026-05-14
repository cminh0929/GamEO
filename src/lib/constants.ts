import type { GameMenuItem } from '../types/platform';

export const PRESET_AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Anya',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Princess',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Vex',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=King',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Queen'
];

export const GAME_MENU: GameMenuItem[] = [
  {
    slug: 'xi-dach',
    name: 'Xì Dách',
    description: 'Blackjack phong cách Việt Nam — tối đa 7 người chơi',
    icon: '🃏',
    status: 'live',
    roomId: 'gameo-table-1',
    minBet: 10_000,
    maxPlayers: 7,
    badge: 'HOT',
  },
  {
    slug: 'tai-xiu',
    name: 'Tài Xỉu',
    description: 'Lắc 3 xúc xắc — đặt cược tài hoặc xỉu',
    icon: '🎲',
    status: 'coming_soon',
    roomId: null,
    minBet: 5_000,
    badge: 'SẮP RA',
  },
  {
    slug: 'mau-binh',
    name: 'Mậu Binh',
    description: 'Sắp xếp 13 lá bài thành thế trận mạnh nhất',
    icon: '♠️',
    status: 'coming_soon',
    roomId: null,
    minBet: 50_000,
    badge: 'SẮP RA',
  },
  {
    slug: 'poker',
    name: 'Poker',
    description: 'Texas Hold\'em — chiến lược và may mắn',
    icon: '🂡',
    status: 'coming_soon',
    roomId: null,
    minBet: 100_000,
    badge: 'SẮP RA',
  },
];
