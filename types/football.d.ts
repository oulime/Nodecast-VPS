/**
 * Types TypeScript pour l'API et la page Football (/foot)
 */

export interface Team {
    name: string;
    logoUrl: string;
}

export interface Score {
    home: number;
    away: number;
    formatted: string;
}

export interface Match {
    id: string;
    competition: string;
    time: string; // "HH:MM"
    homeTeam: Team;
    awayTeam: Team;
    tvChannels: string[];
    hypeScore?: number;
    score?: Score | null;
    status?: 'scheduled' | 'starting_soon' | 'live' | 'finished';
    minute?: string;
    isLive?: boolean;
}

export type MatchesTodayResponse = Match[];
