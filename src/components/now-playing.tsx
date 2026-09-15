import { useEffect, useRef, useState } from "react";
import { Check, Music, Radio } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Vinyl } from "@/components/vinyl";
import { VoteControls } from "@/components/vote-controls";
import { useQueue } from "@/hooks/use-queue";
import type { Song } from "@/lib/songs";
import type { LiveTrack } from "@/lib/spotify/types";

function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Advance the progress bar between polls. Timing is anchored to when the client
 * received the reading, so the server and browser clocks never have to agree.
 */
function useLiveProgress(live: LiveTrack | null): number {
  const [elapsed, setElapsed] = useState(0);
  const anchor = useRef(0);

  useEffect(() => {
    anchor.current = Date.now();
    setElapsed(0);
  }, [live?.fetchedAt, live?.trackId]);

  useEffect(() => {
    if (!live?.isPlaying) return;
    const timer = setInterval(() => setElapsed(Date.now() - anchor.current), 500);
    return () => clearInterval(timer);
  }, [live?.isPlaying, live?.fetchedAt]);

  if (!live?.progressMs) return live?.progressMs ?? 0;
  const projected = live.progressMs + (live.isPlaying ? elapsed : 0);
  return live.durationMs ? Math.min(projected, live.durationMs) : projected;
}

function Artwork({ url, size }: { url: string | null; size: "lg" | "md" }) {
  const dimension = size === "lg" ? "size-20 sm:size-24" : "size-14";
  if (!url) {
    return (
      <span
        className={`flex ${dimension} shrink-0 items-center justify-center rounded-lg bg-secondary`}
      >
        <Music className="size-5 text-muted-foreground" />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={`${dimension} shrink-0 rounded-lg object-cover shadow-lg`}
    />
  );
}

export function NowPlaying({
  song,
  live,
  booth = false,
}: {
  song: Song | null;
  live?: LiveTrack | null;
  booth?: boolean;
}) {
  const { done } = useQueue();
  const isLive = Boolean(live?.isPlaying && (live?.title || live?.trackId));
  const progress = useLiveProgress(isLive ? (live ?? null) : null);

  async function onDone() {
    if (!song) return;
    try {
      await done.mutateAsync(song.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark as played.");
    }
  }

  if (isLive && live) {
    const percent = live.durationMs
      ? Math.min(100, (progress / live.durationMs) * 100)
      : 0;
    return (
      <section className="flex min-w-0 items-stretch gap-1 rounded-2xl border border-border bg-card pr-3">
        {song ? <VoteControls song={song} /> : null}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 py-4 pr-2 pl-3 sm:gap-4">
          <Artwork url={live.albumArtUrl} size="lg" />
          <div className="min-w-0 flex-1 basis-40">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="playing">Now playing</Badge>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Radio className="size-3 animate-pulse" />
                Live from Spotify
              </span>
            </div>
            <h2 className="font-display truncate text-2xl leading-tight font-semibold tracking-tight">
              {live.title}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {live.artist || "Unknown artist"}
            </p>
            {live.durationMs ? (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-linear"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-subtle">
                  {formatTime(progress)} / {formatTime(live.durationMs)}
                </span>
              </div>
            ) : null}
            {booth && live.deviceName ? (
              <p className="mt-1.5 truncate text-xs text-subtle">
                Playing on {live.deviceName}
              </p>
            ) : null}
          </div>
          {booth && song ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onDone}
              disabled={done.isPending}
              className="shrink-0"
            >
              <Check className="size-4" />
              Played
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  if (!song) {
    return (
      <section className="flex min-w-0 items-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 px-5 py-5">
        <Vinyl spinning={false} />
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Now playing
          </p>
          <p className="font-display mt-1 text-xl font-semibold tracking-tight">
            Nothing on the decks
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The next request with the highest score starts here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 items-stretch gap-1 rounded-2xl border border-border bg-card pr-3">
      <VoteControls song={song} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 py-4 pr-2 sm:gap-4">
        {song.albumArtUrl ? (
          <Artwork url={song.albumArtUrl} size="lg" />
        ) : (
          <Vinyl spinning />
        )}
        <div className="min-w-0 flex-1 basis-40">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="playing">Now playing</Badge>
          </div>
          <h2 className="font-display truncate text-2xl leading-tight font-semibold tracking-tight">
            {song.title}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {song.artist || "Unknown artist"}
          </p>
        </div>
        {booth ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onDone}
            disabled={done.isPending}
            className="shrink-0"
          >
            <Check className="size-4" />
            Played
          </Button>
        ) : null}
      </div>
    </section>
  );
}
