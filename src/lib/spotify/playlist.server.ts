import { readSpotifyRow } from "@/lib/spotify/auth.server";
import { spotifyRequest } from "@/lib/spotify/client.server";
import type { PushResult } from "@/lib/spotify/types";

/** Spotify caps a replace-tracks call at 100 URIs. */
const MAX_PLAYLIST_TRACKS = 100;

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

  const uris = rows
    .map((row) => ({
      uri: row.spotify_uri,
      score:
        Number(row.request_count) * 2 + Number(row.upvotes) - Number(row.downvotes),
      id: Number(row.id),
    }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id - b.id))
    .slice(0, MAX_PLAYLIST_TRACKS)
    .map((row) => row.uri);

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
