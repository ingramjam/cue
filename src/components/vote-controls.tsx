import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQueue } from "@/hooks/use-queue";
import type { Song } from "@/lib/songs";

export function VoteControls({ song }: { song: Song }) {
  const { vote, voterId } = useQueue();

  async function onVote(value: 1 | -1) {
    if (!voterId) return;
    try {
      await vote.mutateAsync({ songId: song.id, value });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vote failed.");
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center">
      <button
        type="button"
        aria-label="Upvote"
        aria-pressed={song.myVote === 1}
        onClick={() => onVote(1)}
        className={cn(
          "flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-150",
          "hover:bg-secondary hover:text-foreground",
          song.myVote === 1 && "text-up hover:text-up",
        )}
      >
        <ChevronUp className="size-5" strokeWidth={2.25} />
      </button>
      <span className="font-display min-w-[2ch] text-center text-sm font-semibold tabular-nums text-foreground">
        {song.upvotes - song.downvotes}
      </span>
      <button
        type="button"
        aria-label="Downvote"
        aria-pressed={song.myVote === -1}
        onClick={() => onVote(-1)}
        className={cn(
          "flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-150",
          "hover:bg-secondary hover:text-foreground",
          song.myVote === -1 && "text-down hover:text-down",
        )}
      >
        <ChevronDown className="size-5" strokeWidth={2.25} />
      </button>
    </div>
  );
}
