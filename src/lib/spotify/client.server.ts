import {
  SpotifyNotConnectedError,
  getAccessToken,
  invalidateAccessToken,
} from "@/lib/spotify/auth.server";
import type { SpotifyTrack } from "@/lib/spotify/types";

const API_BASE = "https://api.spotify.com/v1";

export type SpotifyResult<T> =
  | { ok: true; status: number; data: T | null }
  | { ok: false; status: number; message: string };

/** Abort a stuck Spotify call rather than let it stall the queue poll. */
const REQUEST_TIMEOUT_MS = 6000;

async function send(
  token: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function spotifyRequest<T>(
  eventId: number,
  path: string,
  init: RequestInit = {},
): Promise<SpotifyResult<T>> {
  let token: string;
  try {
    token = await getAccessToken(eventId);
  } catch (error) {
    if (error instanceof SpotifyNotConnectedError) {
      return { ok: false, status: 401, message: error.message };
    }
    throw error;
  }

  let response: Response;
  try {
    response = await send(token, path, init);
    if (response.status === 401) {
      await invalidateAccessToken(eventId);
      response = await send(await getAccessToken(eventId), path, init);
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Spotify took too long to respond."
        : error instanceof Error
          ? error.message
          : "Spotify request failed.";
    return { ok: false, status: 0, message };
  }

  if (response.status === 204 || response.status === 202) {
    return { ok: true, status: response.status, data: null };
  }

  const text = await response.text();
  if (!response.ok) {
    let message = text || `Spotify returned ${response.status}.`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // keep the raw body
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      message = `Spotify rate limit hit${retryAfter ? ` — retry in ${retryAfter}s` : ""}.`;
    }
    return { ok: false, status: response.status, message };
  }

  if (!text) return { ok: true, status: response.status, data: null };
  return { ok: true, status: response.status, data: JSON.parse(text) as T };
}

export type RawTrack = {
  id: string | null;
  uri?: string;
  name?: string;
  duration_ms?: number;
  artists?: Array<{ name?: string }>;
  album?: { images?: Array<{ url?: string; width?: number }> };
};

/** Smallest image at least 160px wide, so booth art stays crisp without bloat. */
function pickArt(track: RawTrack): string | null {
  const images = track.album?.images ?? [];
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const chosen = sorted.find((image) => (image.width ?? 0) >= 160) ?? sorted.at(-1);
  return chosen?.url ?? null;
}

export function toTrack(raw: RawTrack | null | undefined): SpotifyTrack | null {
  if (!raw?.id) return null;
  return {
    id: raw.id,
    uri: raw.uri ?? `spotify:track:${raw.id}`,
    title: raw.name ?? "Unknown track",
    artist: (raw.artists ?? []).map((a) => a.name).filter(Boolean).join(", "),
    albumArtUrl: pickArt(raw),
    durationMs: Number(raw.duration_ms ?? 0),
  };
}
