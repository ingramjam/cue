import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Music, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEvent } from "@/components/event-provider";
import { useQueue } from "@/hooks/use-queue";
import { searchTracks } from "@/lib/spotify";
import type { SpotifyTrack } from "@/lib/spotify/types";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function TrackSearch() {
  const event = useEvent();
  const { request, voterId } = useQueue();
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const query = useDebounced(term.trim(), 300);

  const search = useQuery({
    queryKey: ["spotify-search", event.id, query],
    queryFn: () => searchTracks({ data: { eventId: event.id, q: query, voterId } }),
    enabled: query.length >= 2 && Boolean(voterId),
    staleTime: 60_000,
  });

  const results = useMemo(() => search.data ?? [], [search.data]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  async function choose(track: SpotifyTrack) {
    if (pendingId) return;
    setPendingId(track.id);
    try {
      const result = await request.mutateAsync({
        title: track.title,
        artist: track.artist,
        track,
      });
      setTerm("");
      toast.success(
        result.boosted
          ? `${track.title} is already queued — bumped it up.`
          : `${track.title} added to the queue.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add that track.",
      );
    } finally {
      setPendingId(null);
    }
  }

  function onKeyDown(eventArgs: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (eventArgs.key === "ArrowDown") {
      eventArgs.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (eventArgs.key === "ArrowUp") {
      eventArgs.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (eventArgs.key === "Enter") {
      eventArgs.preventDefault();
      const track = results[active];
      if (track) void choose(track);
    }
  }

  const showEmpty =
    query.length >= 2 && !search.isFetching && results.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="track-search">Search for a track</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="track-search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Song or artist"
            autoComplete="off"
            className="pl-9"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="track-search-results"
          />
          {search.isFetching ? (
            <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      </div>

      {showEmpty ? (
        <p className="px-1 text-sm text-muted-foreground">
          Nothing matched “{query}”.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul
          id="track-search-results"
          ref={listRef}
          className="flex max-h-80 flex-col gap-1 overflow-y-auto"
        >
          {results.map((track, index) => (
            <li key={track.id}>
              <button
                type="button"
                onClick={() => choose(track)}
                onMouseEnter={() => setActive(index)}
                disabled={pendingId !== null}
                aria-label={`Request ${track.title} by ${track.artist}`}
                className={`flex w-full items-center gap-3 rounded-lg border px-2 py-2 text-left transition-colors disabled:opacity-60 ${
                  index === active
                    ? "border-border bg-secondary"
                    : "border-transparent hover:bg-secondary/60"
                }`}
              >
                {track.albumArtUrl ? (
                  <img
                    src={track.albumArtUrl}
                    alt=""
                    loading="lazy"
                    className="size-11 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded bg-secondary">
                    <Music className="size-4 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {track.title}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {track.artist}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-subtle">
                  {pendingId === track.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    formatDuration(track.durationMs)
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
