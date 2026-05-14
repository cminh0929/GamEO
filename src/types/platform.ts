export interface Profile {
  id: string;
  username: string;
  balance: number;
  avatar_url: string | null;
}

export interface TransactionLog {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

export interface GameMenuItem {
  slug: string;
  name: string;
  description: string;
  icon: string;
  status: 'live' | 'coming_soon' | 'maintenance';
  roomId: string | null;
  minBet: number;
  maxPlayers?: number;
  badge?: string;
}
