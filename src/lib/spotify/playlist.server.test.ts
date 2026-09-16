import test from "node:test";
import assert from "node:assert/strict";

import { toPlaylistSeedRows } from "./playlist-import.ts";
import { rankPlaylistUris } from "./playlist-rank.ts";

test("rankPlaylistUris prefers higher scores and then earlier queue order", () => {
  const rows = [
    { id: 11, spotify_uri: "spotify:track:3", request_count: 1, upvotes: 0, downvotes: 0 },
    { id: 12, spotify_uri: "spotify:track:1", request_count: 2, upvotes: 2, downvotes: 0 },
    { id: 13, spotify_uri: "spotify:track:2", request_count: 2, upvotes: 1, downvotes: 0 },
  ];

  assert.deepEqual(rankPlaylistUris(rows), [
    "spotify:track:1",
    "spotify:track:2",
    "spotify:track:3",
  ]);
});

test("rankPlaylistUris ignores lower-ranked songs beyond the cap while preserving order", () => {
  const rows = Array.from({ length: 105 }, (_, index) => ({
    id: index + 1,
    spotify_uri: `spotify:track:${index + 1}`,
    request_count: 1,
    upvotes: 0,
    downvotes: 0,
  }));

  assert.equal(rankPlaylistUris(rows).length, 100);
  assert.equal(rankPlaylistUris(rows)[0], "spotify:track:1");
  assert.equal(rankPlaylistUris(rows)[99], "spotify:track:100");
});

test("toPlaylistSeedRows dedupes playlist tracks by normalized title and artist", () => {
  const rows = toPlaylistSeedRows([
    {
      track: {
        id: "one",
        uri: "spotify:track:one",
        name: "Take Me to the River",
        duration_ms: 225000,
        artists: [{ name: "Al Green" }],
        album: { images: [{ url: "https://cdn.example/river.jpg", width: 300 }] },
      },
    },
    {
      track: {
        id: "two",
        uri: "spotify:track:two",
        name: "Take Me to the River",
        duration_ms: 225500,
        artists: [{ name: "Al Green" }],
        album: { images: [{ url: "https://cdn.example/river-2.jpg", width: 300 }] },
      },
    },
    {
      track: {
        id: "three",
        uri: "spotify:track:three",
        name: "Love and Happiness",
        duration_ms: 320000,
        artists: [{ name: "Al Green" }],
        album: { images: [{ url: "https://cdn.example/love.jpg", width: 300 }] },
      },
    },
  ]);

  assert.deepEqual(
    rows.map((row) => ({
      title: row.title,
      artist: row.artist,
      normalizedKey: row.normalizedKey,
      spotifyTrackId: row.spotifyTrackId,
    })),
    [
      {
        title: "Take Me to the River",
        artist: "Al Green",
        normalizedKey: "take me to the river|al green",
        spotifyTrackId: "one",
      },
      {
        title: "Love and Happiness",
        artist: "Al Green",
        normalizedKey: "love and happiness|al green",
        spotifyTrackId: "three",
      },
    ],
  );
});
