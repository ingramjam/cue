import { normalizeKey } from "../normalize.ts";

type RawTrack = {
  id: string | null;
  uri?: string;
  name?: string;
  duration_ms?: number;
  artists?: Array<{ name?: string }>;
  album?: { images?: Array<{ url?: string; width?: number }> };
};

export type PlaylistSeedRow = {
  title: string;
  artist: string;
  normalizedKey: string;
  spotifyTrackId: string;
  spotifyUri: string;
  albumArtUrl: string | null;
  durationMs: number;
};

function pickArt(track: RawTrack): string | null {
  const images = track.album?.images ?? [];
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const chosen = sorted.find((image) => (image.width ?? 0) >= 160) ?? sorted.at(-1);
  return chosen?.url ?? null;
}

function toTrack(raw: RawTrack | null | undefined) {
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
