import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  PushResult,
  SpotifyConfig,
  SpotifyDiagnostics,
  SpotifyPlaylist,
  SpotifyTrack,
} from "@/lib/spotify/types";

export type {
  LiveTrack,
  PushResult,
  SpotifyConfig,
  SpotifyDiagnostics,
  SpotifyPlaylist,
  SpotifyTrack,
} from "@/lib/spotify/types";

const eventSchema = z.object({ eventId: z.number().int().positive() });

export const getSpotifyConfig = createServerFn({ method: "GET" })
  .validator(eventSchema)
  .handler(async ({ data }): Promise<SpotifyConfig> => {
    const { readSpotifyRow, SPOTIFY_SCOPES } = await import(
      "@/lib/spotify/auth.server"
    );
    const row = await readSpotifyRow(data.eventId);
    return {
      clientId: row?.spotify_client_id ?? null,
      connected: Boolean(row?.spotify_refresh_token),
      displayName: row?.spotify_display_name ?? null,
      playlistId: row?.spotify_playlist_id ?? null,
      scopes: SPOTIFY_SCOPES,
    };
  });

export const saveSpotifyClientId = createServerFn({ method: "POST" })
  .validator(
    eventSchema.extend({
      clientId: z
        .string()
        .trim()
        .regex(/^[0-9a-f]{32}$/i, "That does not look like a Spotify client ID."),
    }),
  )
  .handler(async ({ data }) => {
    const { setClientId } = await import("@/lib/spotify/auth.server");
    await setClientId(data.eventId, data.clientId);
    return { ok: true as const };
  });

export const connectSpotify = createServerFn({ method: "POST" })
  .validator(
    eventSchema.extend({
      code: z.string().min(10).max(1000),
      codeVerifier: z.string().min(43).max(128),
      redirectUri: z.string().url(),
    }),
  )
  .handler(async ({ data }) => {
    const { exchangeCode, readSpotifyRow } = await import(
      "@/lib/spotify/auth.server"
    );
    const row = await readSpotifyRow(data.eventId);
    if (!row?.spotify_client_id) {
      throw new Error("Add your Spotify client ID before connecting.");
    }
    return exchangeCode({
      eventId: data.eventId,
      clientId: row.spotify_client_id,
      code: data.code,
      codeVerifier: data.codeVerifier,
      redirectUri: data.redirectUri,
    });
  });

export const disconnectSpotifyAccount = createServerFn({ method: "POST" })
  .validator(eventSchema)
  .handler(async ({ data }) => {
    const { disconnectSpotify } = await import("@/lib/spotify/auth.server");
    await disconnectSpotify(data.eventId);
    return { ok: true as const };
  });

/** Raw player state, so the DJ can see whether their setup is visible at all. */
export const spotifyDiagnostics = createServerFn({ method: "GET" })
  .validator(eventSchema)
  .handler(async ({ data }): Promise<SpotifyDiagnostics> => {
    const { readSpotifyRow } = await import("@/lib/spotify/auth.server");
    const { spotifyRequest } = await import("@/lib/spotify/client.server");
    const row = await readSpotifyRow(data.eventId);
    if (!row?.spotify_refresh_token) {
      return {
        connected: false,
        status: null,
        message: "Spotify is not connected yet.",
        isPlaying: null,
        deviceName: null,
        deviceType: null,
        trackTitle: null,
        trackArtist: null,
        currentlyPlayingType: null,
        raw: null,
      };
    }

    const result = await spotifyRequest<{
      is_playing?: boolean;
      currently_playing_type?: string;
      device?: { name?: string; type?: string } | null;
      item?: { name?: string; artists?: Array<{ name?: string }> } | null;
    }>(data.eventId, "/me/player");

    if (!result.ok) {
      return {
        connected: true,
        status: result.status,
        message: result.message,
        isPlaying: null,
        deviceName: null,
        deviceType: null,
        trackTitle: null,
        trackArtist: null,
        currentlyPlayingType: null,
        raw: null,
      };
    }

    const player = result.data;
    return {
      connected: true,
      status: result.status,
      message: player
        ? null
        : "Spotify returned no active playback session (HTTP 204).",
      isPlaying: player?.is_playing ?? null,
      deviceName: player?.device?.name ?? null,
      deviceType: player?.device?.type ?? null,
      trackTitle: player?.item?.name ?? null,
      trackArtist:
        (player?.item?.artists ?? []).map((a) => a.name).filter(Boolean).join(", ") ||
        null,
      currentlyPlayingType: player?.currently_playing_type ?? null,
      raw: player ? JSON.stringify(player, null, 2).slice(0, 4000) : null,
    };
  });

export const searchTracks = createServerFn({ method: "GET" })
  .validator(
    eventSchema.extend({
      q: z.string().trim().min(2).max(80),
      voterId: z.string().min(8).max(80),
    }),
  )
  .handler(async ({ data }): Promise<SpotifyTrack[]> => {
    const { requireRateLimit } = await import("@/lib/rate-limit.server");
    // Guest-facing proxy onto Spotify search — cap it per device.
    await requireRateLimit(
      `search:${data.voterId}`,
      40,
      60,
      "Slow down a moment before searching again.",
    );

    const { spotifyRequest, toTrack } = await import("@/lib/spotify/client.server");
    const result = await spotifyRequest<{
      tracks?: { items?: Array<Parameters<typeof toTrack>[0]> };
    }>(
      data.eventId,
      `/search?q=${encodeURIComponent(data.q)}&type=track&limit=8`,
    );
    if (!result.ok) return [];
    const items = result.data?.tracks?.items ?? [];
    return items
      .map((item) => toTrack(item))
      .filter((track): track is SpotifyTrack => track !== null);
  });

export const pushSongToSpotifyQueue = createServerFn({ method: "POST" })
  .validator(eventSchema.extend({ songId: z.number().int().positive() }))
  .handler(async ({ data }): Promise<PushResult> => {
    const { pushToSpotifyQueue } = await import("@/lib/spotify/playlist.server");
    return pushToSpotifyQueue(data.eventId, data.songId);
  });

export const syncSpotifyPlaylist = createServerFn({ method: "POST" })
  .validator(eventSchema)
  .handler(async ({ data }) => {
    const { syncPlaylist } = await import("@/lib/spotify/playlist.server");
    await syncPlaylist(data.eventId);
    const { readSpotifyRow } = await import("@/lib/spotify/auth.server");
    const row = await readSpotifyRow(data.eventId);
    return { playlistId: row?.spotify_playlist_id ?? null };
  });

export const listSpotifyPlaylists = createServerFn({ method: "GET" })
  .validator(eventSchema)
  .handler(async ({ data }): Promise<SpotifyPlaylist[]> => {
    const { readSpotifyRow } = await import("@/lib/spotify/auth.server");
    const { spotifyRequest } = await import("@/lib/spotify/client.server");
    const row = await readSpotifyRow(data.eventId);
    if (!row?.spotify_refresh_token) return [];

    const result = await spotifyRequest<{
      items?: Array<{
        id?: string;
        name?: string;
        tracks?: { total?: number };
        owner?: { display_name?: string | null; id?: string | null };
      }>;
    }>(data.eventId, "/me/playlists?limit=50");

    if (!result.ok) return [];
    return (result.data?.items ?? [])
      .map((playlist) => ({
        id: playlist.id ?? "",
        name: playlist.name ?? "Untitled playlist",
        trackCount: Number(playlist.tracks?.total ?? 0),
        ownerName: playlist.owner?.display_name ?? playlist.owner?.id ?? null,
      }))
      .filter((playlist) => playlist.id);
  });

export const setSpotifyPlaylist = createServerFn({ method: "POST" })
  .validator(
    eventSchema.extend({
      playlistId: z
        .string()
        .trim()
        .min(1)
        .max(128)
        .regex(/^[a-zA-Z0-9]+$/, "Invalid playlist id.")
        .nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const { setPlaylistId } = await import("@/lib/spotify/auth.server");
    await setPlaylistId(data.eventId, data.playlistId);
    if (!data.playlistId) return { ok: true as const, imported: 0 };
    const { importSelectedPlaylist } = await import("@/lib/spotify/playlist.server");
    const imported = await importSelectedPlaylist(data.eventId);
    return { ok: true as const, imported: imported.imported };
  });
