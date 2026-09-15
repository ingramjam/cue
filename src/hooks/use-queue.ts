import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getVoterId } from "@/lib/voter";
import { useEvent } from "@/components/event-provider";
import {
  listQueue,
  markPlayed,
  playSong,
  removeSong,
  requestSong,
  voteSong,
  type QueuePayload,
  type Song,
} from "@/lib/songs";
import { pushSongToSpotifyQueue } from "@/lib/spotify";
import type { SpotifyTrack } from "@/lib/spotify/types";

function applyVote(song: Song, value: 1 | -1): Song {
  const nextVote: 0 | 1 | -1 = song.myVote === value ? 0 : value;
  let upvotes = song.upvotes;
  let downvotes = song.downvotes;
  if (song.myVote === 1) upvotes -= 1;
  if (song.myVote === -1) downvotes -= 1;
  if (nextVote === 1) upvotes += 1;
  if (nextVote === -1) downvotes += 1;
  return {
    ...song,
    myVote: nextVote,
    upvotes,
    downvotes,
    score: song.requestCount * 2 + upvotes - downvotes,
  };
}

function patchQueue(
  current: QueuePayload,
  songId: number,
  patch: (song: Song) => Song,
): QueuePayload {
  const mapSong = (song: Song) => (song.id === songId ? patch(song) : song);
  return {
    ...current,
    nowPlaying: current.nowPlaying ? mapSong(current.nowPlaying) : null,
    queue: current.queue.map(mapSong),
  };
}

export function useVoterId() {
  const [voterId, setVoterId] = useState("");
  useEffect(() => {
    setVoterId(getVoterId());
  }, []);
  return voterId;
}

export function useQueue() {
  const event = useEvent();
  const eventId = event.id;
  const voterId = useVoterId();
  const queryClient = useQueryClient();
  const queryKey = ["queue", eventId, voterId] as const;
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["queue", eventId] });

  const query = useQuery({
    queryKey,
    queryFn: () => listQueue({ data: { eventId, voterId } }),
    enabled: Boolean(voterId),
    refetchInterval: 3500,
  });

  const request = useMutation({
    mutationFn: (input: {
      title: string;
      artist: string;
      track?: SpotifyTrack;
    }) =>
      requestSong({
        data: {
          eventId,
          voterId,
          title: input.title,
          artist: input.artist,
          track: input.track ? { ...input.track } : undefined,
        },
      }),
    onSuccess: invalidate,
  });

  const vote = useMutation({
    mutationFn: (input: { songId: number; value: 1 | -1 }) =>
      voteSong({ data: { ...input, eventId, voterId } }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<QueuePayload>(queryKey);
      if (previous) {
        queryClient.setQueryData<QueuePayload>(queryKey, (current) =>
          current
            ? patchQueue(current, input.songId, (song) =>
                applyVote(song, input.value),
              )
            : current,
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: invalidate,
  });

  const play = useMutation({
    mutationFn: (songId: number) => playSong({ data: { eventId, songId } }),
    onSuccess: invalidate,
  });

  const done = useMutation({
    mutationFn: (songId: number) => markPlayed({ data: { eventId, songId } }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (songId: number) => removeSong({ data: { eventId, songId } }),
    onSuccess: invalidate,
  });

  const pushToSpotify = useMutation({
    mutationFn: (songId: number) =>
      pushSongToSpotifyQueue({ data: { eventId, songId } }),
  });

  return { voterId, query, request, vote, play, done, remove, pushToSpotify };
}
