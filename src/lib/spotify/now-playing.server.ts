import { spotifyRequest, toTrack, type RawTrack } from "@/lib/spotify/client.server";
import { looseTitle } from "@/lib/normalize";
import type { LiveTrack } from "@/lib/spotify/types";

/**
 * How long a cached read stays fresh. Every guest polls the queue every 3.5s,
 * so without this cache a busy room would multiply straight into Spotify's
 * rate limit. Vercel is serverless, so the cache has to live in the database.
 */
const CACHE_TTL_SECONDS = 4;

type CacheRow = {
  track_id: string | null;
  title: string;
  artist: string;
  album_art_url: string | null;
  duration_ms: number | null;
  progress_ms: number | null;
  is_playing: boolean;
  device_name: string | null;
  fetched_at: Date | string;
};

type PlayerResponse = {
  is_playing?: boolean;
  progress_ms?: number | null;
  currently_playing_type?: string;
  device?: { name?: string; type?: string } | null;
  item?: RawTrack | null;
};

function toLiveTrack(row: CacheRow): LiveTrack | null {
  if (!row.title && !row.track_id) return null;
  return {
    trackId: row.track_id,
    title: row.title,
    artist: row.artist,
    albumArtUrl: row.album_art_url,
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    progressMs: row.progress_ms === null ? null : Number(row.progress_ms),
    isPlaying: Boolean(row.is_playing),
    deviceName: row.device_name,
    fetchedAt: new Date(row.fetched_at).getTime(),
  };
}

/**
 * Take the refresh slot for this room, or return false if another in-flight
 * request already has it. The conditional UPDATE is the lock.
 */
async function claimRefresh(eventId: number): Promise<boolean> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  // Backdate on insert so the very first read refreshes immediately.
  await sql.query(
    `insert into now_playing_cache (event_id, fetched_at)
     values ($1, now() - interval '1 hour')
     on conflict (event_id) do nothing`,
    [eventId],
  );
  const claimed = await sql.query<{ event_id: number }>(
    `update now_playing_cache set fetched_at = now()
     where event_id = $1 and fetched_at < now() - ($2::int * interval '1 second')
     returning event_id`,
    [eventId, CACHE_TTL_SECONDS],
  );
  return claimed.length > 0;
}

async function writeCache(
  eventId: number,
  player: PlayerResponse | null,
): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const track = toTrack(player?.item);
  await sql`
    update now_playing_cache set
      track_id = ${track?.id ?? null},
      title = ${track?.title ?? ""},
      artist = ${track?.artist ?? ""},
      album_art_url = ${track?.albumArtUrl ?? null},
      duration_ms = ${track?.durationMs ?? null},
      progress_ms = ${player?.progress_ms ?? null},
      is_playing = ${Boolean(player?.is_playing)},
      device_name = ${player?.device?.name ?? null},
      fetched_at = now(),
      failed_at = null
    where event_id = ${eventId}
  `;
}

async function markFailure(eventId: number): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`
    update now_playing_cache set is_playing = false, failed_at = now()
    where event_id = ${eventId}
  `;
}

/**
 * Reconcile the queue with what Spotify is actually playing: promote a matching
 * request to "playing" and retire whatever it replaced. Only the request that
 * won the refresh claim runs this, so there is no race.
 */
async function autoAdvance(eventId: number, player: PlayerResponse): Promise<void> {
  if (!player.is_playing) return;
  const track = toTrack(player.item);
  if (!track) return;

  const { getSql } = await import("@/lib/db");
  const sql = await getSql();

  const byId = await sql<{ id: number }>`
    select id from songs
    where event_id = ${eventId}
      and spotify_track_id = ${track.id}
      and status in ('queued', 'playing')
    limit 1
  `;

  let matchId = byId[0] ? Number(byId[0].id) : null;

  if (matchId === null) {
    // Free-typed requests have no track id, so fall back to a loose title match.
    const candidates = await sql<{ id: number; title: string }>`
      select id, title from songs
      where event_id = ${eventId} and status in ('queued', 'playing')
    `;
    const target = looseTitle(track.title);
    const hit = candidates.find(
      (row) => looseTitle(row.title) === target && target.length > 0,
    );
    matchId = hit ? Number(hit.id) : null;
    if (matchId !== null) {
      await sql`
        update songs set spotify_track_id = ${track.id}, spotify_uri = ${track.uri},
          album_art_url = ${track.albumArtUrl}, duration_ms = ${track.durationMs}
        where id = ${matchId}
      `;
    }
  }

  if (matchId === null) {
    // Spotify moved on to something nobody requested — the old pick is done.
    await sql`
      update songs set status = 'played'
      where event_id = ${eventId} and status = 'playing'
    `;
    return;
  }

  await sql`
    update songs set status = 'played'
    where event_id = ${eventId} and status = 'playing' and id <> ${matchId}
  `;
  await sql`
    update songs set status = 'playing'
    where id = ${matchId} and status <> 'playing'
  `;
}

/** Current Spotify playback for a room, cached and auto-reconciled. */
export async function getLiveTrack(eventId: number): Promise<LiveTrack | null> {
  if (await claimRefresh(eventId)) {
    const result = await spotifyRequest<PlayerResponse>(eventId, "/me/player");
    if (result.ok) {
      await writeCache(eventId, result.data);
      if (result.data) await autoAdvance(eventId, result.data);
    } else {
      await markFailure(eventId);
    }
    // Riding the refresh claim keeps vote-driven reordering in the playlist
    // without adding a Spotify call to every poll.
    try {
      const { syncPlaylist } = await import("@/lib/spotify/playlist.server");
      await syncPlaylist(eventId);
    } catch {
      // Mirroring is best-effort.
    }
  }

  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<CacheRow>`
    select track_id, title, artist, album_art_url, duration_ms, progress_ms,
           is_playing, device_name, fetched_at
    from now_playing_cache where event_id = ${eventId}
  `;
  return rows[0] ? toLiveTrack(rows[0]) : null;
}
