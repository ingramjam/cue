export type RankedPlaylistRow = {
  id: number;
  spotify_uri: string;
  request_count: number;
  upvotes: number;
  downvotes: number;
};

export function rankPlaylistUris(rows: RankedPlaylistRow[], limit = 100): string[] {
  return rows
    .map((row) => ({
      uri: row.spotify_uri,
      score:
        Number(row.request_count) * 2 + Number(row.upvotes) - Number(row.downvotes),
      id: Number(row.id),
    }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id - b.id))
    .slice(0, limit)
    .map((row) => row.uri);
}
