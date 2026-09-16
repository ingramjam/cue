import { NowPlaying } from "@/components/now-playing";
import { QueueList } from "@/components/queue-list";
import { useQueue } from "@/hooks/use-queue";

export function QueueSection({
  booth = false,
  empty,
}: {
  booth?: boolean;
  empty: string;
}) {
  const { query } = useQueue();
  const nowPlaying = query.data?.nowPlaying ?? null;
  const live = query.data?.live ?? null;
  const queue = query.data?.queue ?? [];

  return (
    <div className="flex flex-col gap-4">
      <NowPlaying song={nowPlaying} live={live} booth={booth} />
      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            On deck
          </h2>
          <p className="text-xs tabular-nums text-muted-foreground">
            {query.isLoading ? "Loading" : `${queue.length} in queue`}
          </p>
        </div>
        {query.isLoading ? (
          <div className="flex flex-col gap-2">
            {["a", "b", "c"].map((key) => (
              <div
                key={key}
                className="h-20 animate-pulse rounded-lg border border-border bg-card"
              />
            ))}
          </div>
        ) : query.isError ? (
          <p className="rounded-lg border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Could not load the queue. Try again in a moment.
          </p>
        ) : (
          <div className={booth ? "max-h-[32rem] overflow-y-auto pr-1" : undefined}>
            <QueueList songs={queue} booth={booth} empty={empty} />
          </div>
        )}
      </div>
    </div>
  );
}
