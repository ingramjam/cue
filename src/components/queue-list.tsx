import { Check, ListPlus, Music, Play, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VoteControls } from "@/components/vote-controls";
import { useQueue } from "@/hooks/use-queue";
import type { Song } from "@/lib/songs";

function rankLabel(index: number) {
  return String(index + 1).padStart(2, "0");
}

export function QueueList({
  songs,
  booth = false,
  empty,
}: {
  songs: Song[];
  booth?: boolean;
  empty: string;
}) {
  const { play, done, remove, pushToSpotify, query } = useQueue();
  const spotifyConnected = query.data?.spotifyConnected ?? false;

  if (songs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }

  async function onPlay(id: number) {
    try {
      await play.mutateAsync(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start that track.");
    }
  }

  async function onDone(id: number) {
    try {
      await done.mutateAsync(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark as played.");
    }
  }

  async function onRemove(id: number, title: string) {
    try {
      await remove.mutateAsync(id);
      toast.success(`Removed ${title}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove that track.");
    }
  }

  async function onPush(id: number) {
    try {
      const result = await pushToSpotify.mutateAsync(id);
      if (result.ok) toast.success(`Queued ${result.title} on Spotify.`);
      else toast.error(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reach Spotify.");
    }
  }

  return (
    <ol className="flex flex-col gap-2">
      {songs.map((song, index) => (
        <li
          key={song.id}
          className="flex items-stretch gap-1 rounded-lg border border-border bg-card pr-2"
        >
          <VoteControls song={song} />
          <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2">
            <span className="font-display w-7 shrink-0 text-sm font-semibold tabular-nums text-subtle">
              {rankLabel(index)}
            </span>
            {song.albumArtUrl ? (
              <img
                src={song.albumArtUrl}
                alt=""
                loading="lazy"
                className="size-11 shrink-0 rounded object-cover"
              />
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center rounded bg-secondary">
                <Music className="size-4 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{song.title}</p>
              <p className="truncate text-sm text-muted-foreground">
                {song.artist || "Unknown artist"}
              </p>
              <p className="mt-1 text-xs tabular-nums text-subtle">
                {song.requestCount} {song.requestCount === 1 ? "request" : "requests"}
              </p>
            </div>
            {booth ? (
              <div className="flex shrink-0 items-center gap-1">
                {spotifyConnected && song.spotifyTrackId ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Queue ${song.title} on Spotify`}
                    title="Queue on Spotify"
                    onClick={() => onPush(song.id)}
                    disabled={pushToSpotify.isPending}
                  >
                    <ListPlus className="size-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  aria-label={`Play ${song.title}`}
                  onClick={() => onPlay(song.id)}
                  disabled={play.isPending}
                >
                  <Play className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Mark ${song.title} played`}
                  onClick={() => onDone(song.id)}
                  disabled={done.isPending}
                >
                  <Check className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${song.title}`}
                  title="Remove from queue"
                  onClick={() => onRemove(song.id, song.title)}
                  disabled={remove.isPending}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
