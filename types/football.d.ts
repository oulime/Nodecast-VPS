/**
 * Types TypeScript pour l'API et la page Football (/foot)
 */

export interface Team {
    name: string;
    logoUrl: string;
}

export interface Match {
    id: string;
    competition: string;
    time: string; // "HH:MM"
    homeTeam: Team;
    awayTeam: Team;
    tvChannels: string[];
}

export type MatchesTodayResponse = Match[];
