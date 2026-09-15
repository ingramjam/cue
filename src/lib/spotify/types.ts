/** Client-safe Spotify shapes. Nothing here may carry a token. */

export type SpotifyTrack = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  durationMs: number;
};

export type LiveTrack = {
  trackId: string | null;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  durationMs: number | null;
  progressMs: number | null;
  isPlaying: boolean;
  deviceName: string | null;
  /** Epoch ms of the last Spotify read, so the client can advance the bar itself. */
  fetchedAt: number;
};

export type SpotifyConfig = {
  clientId: string | null;
  connected: boolean;
  displayName: string | null;
  playlistId: string | null;
  scopes: string;
};

export type SpotifyDiagnostics = {
  connected: boolean;
  status: number | null;
  message: string | null;
  isPlaying: boolean | null;
  deviceName: string | null;
  deviceType: string | null;
  trackTitle: string | null;
  trackArtist: string | null;
  currentlyPlayingType: string | null;
  raw: string | null;
};

export type PushResult =
  | { ok: true; title: string }
  | { ok: false; reason: "no-device" | "not-connected" | "no-track" | "error"; message: string };
