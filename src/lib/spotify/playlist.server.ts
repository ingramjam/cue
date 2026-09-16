import { normalizeKey } from "@/lib/normalize";
import { readSpotifyRow } from "@/lib/spotify/auth.server";
import {
  spotifyRequest,
  toTrack,
  type RawTrack,
} from "@/lib/spotify/client.server";
import type { PushResult, SpotifyPlaylistOption } from "@/lib/spotify/types";
import { rankPlaylistUris } from "@/lib/spotify/playlist-rank";

/** Spotify caps a replace-tracks call at 100 URIs. */
const MAX_PLAYLIST_TRACKS = 100;
const PLAYLIST_PAGE_SIZE = 50;
const PLAYLIST_TRACK_PAGE_SIZE = 100;
const MAX_IMPORTED_PLAYLIST_TRACKS = 250;

type PlaylistPage = {
  items?: Array<{
    id?: string;
    name?: string;
    tracks?: { total?: number } | null;
    owner?: { display_name?: string | null } | null;
  }>;
  total?: number;
};

type PlaylistTrackPage = {
  items?: Array<{ track?: RawTrack | null }>;
  total?: number;
};

type PlaylistDetails = {
  id?: string;
  name?: string;
};

type PlaylistSeedRow = {
  title: string;
  artist: string;
  normalizedKey: string;
  spotifyTrackId: string;
  spotifyUri: string;
  albumArtUrl: string | null;
  durationMs: number;
};

export function toPlaylistSeedRows(
  items: Array<{ track?: RawTrack | null }>,
): PlaylistSeedRow[] {
  const rows: PlaylistSeedRow[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const track = toTrack(item.track);
    if (!track) continue;

    const normalizedKey = normalizeKey(track.title, track.artist);
    if (!normalizedKey.split("|")[0] || seen.has(normalizedKey)) continue;

    seen.add(normalizedKey);
    rows.push({
      title: track.title,
      artist: track.artist,
      normalizedKey,
      spotifyTrackId: track.id,
      spotifyUri: track.uri,
      albumArtUrl: track.albumArtUrl,
      durationMs: track.durationMs,
    });
  }

  return rows;
}

export async function listUserPlaylists(eventId: number): Promise<SpotifyPlaylistOption[]> {
  const playlists: SpotifyPlaylistOption[] = [];
  const seen = new Set<string>();

  for (
    let offset = 0;
    offset < MAX_IMPORTED_PLAYLIST_TRACKS;
    offset += PLAYLIST_PAGE_SIZE
  ) {
    const result = await spotifyRequest<PlaylistPage>(
      eventId,
      `/me/playlists?limit=${PLAYLIST_PAGE_SIZE}&offset=${offset}`,
    );
    if (!result.ok) throw new Error(result.message);

    const items = result.data?.items ?? [];
    for (const item of items) {
      if (!item?.id || !item.name || seen.has(item.id)) continue;
      seen.add(item.id);
      playlists.push({
        id: item.id,
        name: item.name,
        trackCount: Number(item.tracks?.total ?? 0),
        ownerName: item.owner?.display_name ?? null,
      });
    }

    const total = Number(result.data?.total ?? items.length);
    if (offset + PLAYLIST_PAGE_SIZE >= total || items.length < PLAYLIST_PAGE_SIZE) break;
  }

  return playlists;
}

async function fetchPlaylistTrackRows(
  eventId: number,
  playlistId: string,
): Promise<PlaylistSeedRow[]> {
  const items: Array<{ track?: RawTrack | null }> = [];

  for (
    let offset = 0;
    offset < MAX_IMPORTED_PLAYLIST_TRACKS;
    offset += PLAYLIST_TRACK_PAGE_SIZE
  ) {
    const result = await spotifyRequest<PlaylistTrackPage>(
      eventId,
      `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${PLAYLIST_TRACK_PAGE_SIZE}&offset=${offset}`,
    );
    if (!result.ok) throw new Error(result.message);

    const pageItems = result.data?.items ?? [];
    items.push(...pageItems);

    const total = Number(result.data?.total ?? pageItems.length);
    if (
      offset + PLAYLIST_TRACK_PAGE_SIZE >= total ||
      pageItems.length < PLAYLIST_TRACK_PAGE_SIZE
    ) {
      break;
    }
  }

  return toPlaylistSeedRows(items).slice(0, MAX_IMPORTED_PLAYLIST_TRACKS);
}

async function readPlaylistDetails(
  eventId: number,
  playlistId: string,
): Promise<{ id: string; name: string }> {
  const result = await spotifyRequest<PlaylistDetails>(
    eventId,
    `/playlists/${encodeURIComponent(playlistId)}?fields=id,name`,
  );
  if (!result.ok || !result.data?.id || !result.data.name) {
    throw new Error(result.ok ? "Could not load that playlist." : result.message);
  }
  return { id: result.data.id, name: result.data.name };
}

async function ensurePlaylist(eventId: number): Promise<string | null> {
  const row = await readSpotifyRow(eventId);
  if (!row?.spotify_refresh_token) return null;
  if (row.spotify_playlist_id) return row.spotify_playlist_id;

  let userId = row.spotify_user_id;
  if (!userId) {
    const me = await spotifyRequest<{ id: string }>(eventId, "/me");
    if (!me.ok || !me.data) return null;
    userId = me.data.id;
  }

  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const nameRows = await sql<{ name: string }>`
    select name from events where id = ${eventId}
  `;
  const eventName = nameRows[0]?.name ?? "Tonight";

  const created = await spotifyRequest<{ id: string }>(
    eventId,
    `/users/${encodeURIComponent(userId)}/playlists`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `CUE — ${eventName}`,
        public: false,
        description: "Live crowd requests, ranked by votes. Synced by CUE.",
      }),
    },
  );
  if (!created.ok || !created.data) return null;

  await sql`
    update events set spotify_user_id = ${userId}, spotify_playlist_id = ${created.data.id}
    where id = ${eventId}
  `;
  return created.data.id;
}

export async function importPlaylistIntoQueue(
  eventId: number,
  playlistId: string,
): Promise<{ imported: number; playlistId: string; playlistName: string }> {
  const playlist = await readPlaylistDetails(eventId, playlistId);
  const rows = await fetchPlaylistTrackRows(eventId, playlist.id);

  const { getSql } = await import("@/lib/db");
  const sql = await getSql();

  await sql`
    update events set
      spotify_playlist_id = ${playlist.id},
      spotify_playlist_synced_key = null
    where id = ${eventId}
  `;

  await sql`
    delete from songs
    where event_id = ${eventId} and status in ('queued', 'playing')
  `;

  for (const row of rows) {
    await sql`
      insert into songs (
        event_id,
        title,
        artist,
        normalized_key,
        request_count,
        spotify_track_id,
        spotify_uri,
        album_art_url,
        duration_ms
      )
      values (
        ${eventId},
        ${row.title},
        ${row.artist},
        ${row.normalizedKey},
        0,
        ${row.spotifyTrackId},
        ${row.spotifyUri},
        ${row.albumArtUrl},
        ${row.durationMs}
      )
    `;
  }

  await syncPlaylist(eventId);

  return {
    imported: rows.length,
    playlistId: playlist.id,
    playlistName: playlist.name,
  };
}

/**
 * Mirror the ranked queue into the room's private playlist. This is what makes
 * the requests visible inside djay Pro, which can browse Spotify playlists but
 * exposes no API of its own.
 */
export async function syncPlaylist(eventId: number): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();

  const rows = await sql<{
    spotify_uri: string;
    request_count: number;
    upvotes: number;
    downvotes: number;
    id: number;
  }>`
    select id, spotify_uri, request_count, upvotes, downvotes
    from songs
    where event_id = ${eventId}
      and status in ('queued', 'playing')
      and spotify_uri is not null
  `;

  const uris = rankPlaylistUris(rows, MAX_PLAYLIST_TRACKS);

  const key = uris.join(",");
  const existing = await readSpotifyRow(eventId);
  if (!existing?.spotify_refresh_token) return;
  if (existing.spotify_playlist_synced_key === key) return;

  const playlistId = await ensurePlaylist(eventId);
  if (!playlistId) return;

  const result = await spotifyRequest(
    eventId,
    `/playlists/${encodeURIComponent(playlistId)}/tracks`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris }),
    },
  );
  if (!result.ok) return;

  await sql`
    update events set spotify_playlist_synced_key = ${key} where id = ${eventId}
  `;
}

export async function pushToSpotifyQueue(
  eventId: number,
  songId: number,
): Promise<PushResult> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ spotify_uri: string | null; title: string }>`
    select spotify_uri, title from songs
    where id = ${songId} and event_id = ${eventId}
  `;
  const song = rows[0];
  if (!song) {
    return { ok: false, reason: "no-track", message: "That track is not in this room." };
  }
  if (!song.spotify_uri) {
    return {
      ok: false,
      reason: "no-track",
      message: "That request was typed by hand, so Spotify has nothing to queue.",
    };
  }

  const result = await spotifyRequest(
    eventId,
    `/me/player/queue?uri=${encodeURIComponent(song.spotify_uri)}`,
    { method: "POST" },
  );

  if (result.ok) return { ok: true, title: song.title };
  if (result.status === 401) {
    return { ok: false, reason: "not-connected", message: result.message };
  }
  // Spotify answers 404 when no device is holding playback — the usual case
  // when the DJ is mixing in djay Pro instead of the Spotify app.
  if (result.status === 404) {
    return {
      ok: false,
      reason: "no-device",
      message:
        "No active Spotify device. Start playback in the Spotify app first — " +
        "djay Pro does not register as one.",
    };
  }
  return { ok: false, reason: "error", message: result.message };
}
