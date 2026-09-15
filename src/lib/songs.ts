import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeKey } from "@/lib/normalize";
import type { LiveTrack } from "@/lib/spotify/types";

export type SongStatus = "queued" | "playing" | "played";

export type Song = {
  id: number;
  title: string;
  artist: string;
  requestCount: number;
  upvotes: number;
  downvotes: number;
  score: number;
  status: SongStatus;
  myVote: 0 | 1 | -1;
  albumArtUrl: string | null;
  spotifyTrackId: string | null;
};

export type QueuePayload = {
  nowPlaying: Song | null;
  queue: Song[];
  live: LiveTrack | null;
  spotifyConnected: boolean;
};

type SongRow = {
  id: number;
  title: string;
  artist: string;
  request_count: number;
  upvotes: number;
  downvotes: number;
  status: SongStatus;
  album_art_url: string | null;
  spotify_track_id: string | null;
};

type VoteRow = {
  song_id: number;
  value: number;
};

const eventId = z.number().int().positive();
const voterId = z.string().min(8).max(80);
const songId = z.number().int().positive();

const trackSchema = z
  .object({
    id: z.string().min(1).max(64),
    uri: z.string().min(1).max(128),
    title: z.string().min(1).max(200),
    artist: z.string().max(200),
    albumArtUrl: z.string().url().nullable(),
    durationMs: z.number().int().nonnegative(),
  })
  .optional();

function toSong(row: SongRow, myVote: 0 | 1 | -1): Song {
  const requestCount = Number(row.request_count);
  const upvotes = Number(row.upvotes);
  const downvotes = Number(row.downvotes);
  return {
    id: Number(row.id),
    title: row.title,
    artist: row.artist ?? "",
    requestCount,
    upvotes,
    downvotes,
    score: requestCount * 2 + upvotes - downvotes,
    status: row.status,
    myVote,
    albumArtUrl: row.album_art_url,
    spotifyTrackId: row.spotify_track_id,
  };
}

function sortQueue(songs: Song[]): Song[] {
  return [...songs].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id - b.id;
  });
}

export const listQueue = createServerFn({ method: "GET" })
  .validator(z.object({ eventId, voterId }))
  .handler(async ({ data }): Promise<QueuePayload> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();

    const connectedRows = await sql<{ connected: boolean }>`
      select spotify_refresh_token is not null as connected
      from events where id = ${data.eventId}
    `;
    const spotifyConnected = Boolean(connectedRows[0]?.connected);

    let live: LiveTrack | null = null;
    if (spotifyConnected) {
      // Never let a Spotify hiccup take the whole queue down with it.
      try {
        const { getLiveTrack } = await import("@/lib/spotify/now-playing.server");
        live = await getLiveTrack(data.eventId);
      } catch {
        live = null;
      }
    }

    const rows = await sql<SongRow>`
      select id, title, artist, request_count, upvotes, downvotes, status,
             album_art_url, spotify_track_id
      from songs
      where event_id = ${data.eventId} and status in ('queued', 'playing')
      order by id asc
    `;
    const votes = await sql<VoteRow>`
      select v.song_id, v.value
      from votes v
      join songs s on s.id = v.song_id
      where v.voter_id = ${data.voterId} and s.event_id = ${data.eventId}
    `;
    const voteMap = new Map<number, number>();
    for (const vote of votes) voteMap.set(Number(vote.song_id), Number(vote.value));

    const mapped = rows.map((row) => {
      const raw = voteMap.get(Number(row.id)) ?? 0;
      const myVote: 0 | 1 | -1 = raw === 1 || raw === -1 ? raw : 0;
      return toSong(row, myVote);
    });

    const nowPlaying = mapped.find((song) => song.status === "playing") ?? null;
    const queue = sortQueue(mapped.filter((song) => song.status === "queued"));
    return { nowPlaying, queue, live, spotifyConnected };
  });

export const requestSong = createServerFn({ method: "POST" })
  .validator(
    z.object({
      eventId,
      voterId,
      title: z.string().min(1).max(200),
      artist: z.string().max(200).optional(),
      track: trackSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { requireRateLimit } = await import("@/lib/rate-limit.server");
    await requireRateLimit(
      `request:${data.voterId}`,
      12,
      60,
      "You have sent a lot of requests — give it a minute.",
    );

    const title = (data.track?.title ?? data.title).trim().replace(/\s+/g, " ");
    const artist = (data.track?.artist ?? data.artist ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!title) throw new Error("Song title is required.");

    const key = normalizeKey(title, artist);
    if (!key.split("|")[0]) throw new Error("Song title is required.");

    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ id: number; request_count: number }>`
      insert into songs (
        event_id, title, artist, normalized_key,
        spotify_track_id, spotify_uri, album_art_url, duration_ms
      )
      values (
        ${data.eventId}, ${title}, ${artist}, ${key},
        ${data.track?.id ?? null}, ${data.track?.uri ?? null},
        ${data.track?.albumArtUrl ?? null}, ${data.track?.durationMs ?? null}
      )
      on conflict (event_id, normalized_key) do update set
        request_count = songs.request_count + 1,
        last_requested_at = now(),
        status = case when songs.status = 'played' then 'queued' else songs.status end,
        spotify_track_id = coalesce(songs.spotify_track_id, excluded.spotify_track_id),
        spotify_uri = coalesce(songs.spotify_uri, excluded.spotify_uri),
        album_art_url = coalesce(songs.album_art_url, excluded.album_art_url),
        duration_ms = coalesce(songs.duration_ms, excluded.duration_ms)
      returning id, request_count
    `;
    const row = rows[0];
    if (!row) throw new Error("Could not save that request.");

    try {
      const { syncPlaylist } = await import("@/lib/spotify/playlist.server");
      await syncPlaylist(data.eventId);
    } catch {
      // Playlist mirroring is a convenience; never fail the request over it.
    }

    return {
      id: Number(row.id),
      boosted: Number(row.request_count) > 1,
    };
  });

export const voteSong = createServerFn({ method: "POST" })
  .validator(
    z.object({
      eventId,
      songId,
      voterId,
      value: z.union([z.literal(1), z.literal(-1)]),
    }),
  )
  .handler(async ({ data }) => {
    const { requireRateLimit } = await import("@/lib/rate-limit.server");
    await requireRateLimit(
      `vote:${data.voterId}`,
      120,
      60,
      "Too many votes at once — try again shortly.",
    );

    const { getSql } = await import("@/lib/db");
    const sql = await getSql();

    const owned = await sql<{ id: number }>`
      select id from songs where id = ${data.songId} and event_id = ${data.eventId}
    `;
    if (!owned[0]) throw new Error("That track is not in this room.");

    const existing = await sql<{ value: number }>`
      select value from votes
      where song_id = ${data.songId} and voter_id = ${data.voterId}
    `;
    const current = existing[0] ? Number(existing[0].value) : 0;

    if (current === data.value) {
      await sql`
        delete from votes
        where song_id = ${data.songId} and voter_id = ${data.voterId}
      `;
    } else if (current === 0) {
      await sql`
        insert into votes (song_id, voter_id, value)
        values (${data.songId}, ${data.voterId}, ${data.value})
      `;
    } else {
      await sql`
        update votes set value = ${data.value}
        where song_id = ${data.songId} and voter_id = ${data.voterId}
      `;
    }

    await sql`
      update songs set
        upvotes = (select count(*)::int from votes where song_id = ${data.songId} and value = 1),
        downvotes = (select count(*)::int from votes where song_id = ${data.songId} and value = -1)
      where id = ${data.songId}
    `;

    return { ok: true as const };
  });

export const playSong = createServerFn({ method: "POST" })
  .validator(z.object({ eventId, songId }))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      update songs set status = 'played'
      where event_id = ${data.eventId} and status = 'playing' and id <> ${data.songId}
    `;
    await sql`
      update songs set status = 'playing'
      where id = ${data.songId} and event_id = ${data.eventId}
        and status in ('queued', 'playing')
    `;
    return { ok: true as const };
  });

export const markPlayed = createServerFn({ method: "POST" })
  .validator(z.object({ eventId, songId }))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      update songs set status = 'played'
      where id = ${data.songId} and event_id = ${data.eventId}
    `;
    return { ok: true as const };
  });

export const removeSong = createServerFn({ method: "POST" })
  .validator(z.object({ eventId, songId }))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      delete from songs where id = ${data.songId} and event_id = ${data.eventId}
    `;
    return { ok: true as const };
  });
