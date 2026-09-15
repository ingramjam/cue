import type { SpotifyTrack } from "@/lib/spotify/types";

const STORAGE_KEY = "cue-spotify-pkce";
const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";

export type PendingAuth = {
  verifier: string;
  state: string;
  eventId: number;
  eventCode: string;
  redirectUri: string;
};

function randomString(length: number): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function base64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function spotifyRedirectUri(): string {
  return `${window.location.origin}/spotify/callback`;
}

export async function beginSpotifyAuth(input: {
  eventId: number;
  eventCode: string;
  clientId: string;
  scopes: string;
}): Promise<void> {
  const verifier = randomString(64);
  const challenge = base64Url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const state = randomString(24);
  const redirectUri = spotifyRedirectUri();

  const pending: PendingAuth = {
    verifier,
    state,
    eventId: input.eventId,
    eventCode: input.eventCode,
    redirectUri,
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));

  const url = new URL(AUTHORIZE_ENDPOINT);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    scope: input.scopes,
    code_challenge_method: "S256",
    code_challenge: challenge,
    redirect_uri: redirectUri,
    state,
  }).toString();
  window.location.href = url.toString();
}

export function takePendingAuth(): PendingAuth | null {
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(STORAGE_KEY);
  try {
    return JSON.parse(raw) as PendingAuth;
  } catch {
    return null;
  }
}

export function trackToRequest(track: SpotifyTrack) {
  return {
    id: track.id,
    uri: track.uri,
    title: track.title,
    artist: track.artist,
    albumArtUrl: track.albumArtUrl,
    durationMs: track.durationMs,
  };
}
