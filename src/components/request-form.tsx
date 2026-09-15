import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrackSearch } from "@/components/track-search";
import { useQueue } from "@/hooks/use-queue";

export function RequestForm({ compact = false }: { compact?: boolean }) {
  const { request, query } = useQueue();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const spotifyConnected = query.data?.spotifyConnected ?? false;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      toast.error("Add a song title first.");
      return;
    }
    try {
      const result = await request.mutateAsync({
        title: nextTitle,
        artist: artist.trim(),
      });
      setTitle("");
      setArtist("");
      if (result.boosted) {
        toast.success("Already in the queue — bumped its priority.");
      } else {
        toast.success("Added to the queue.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that track.");
    }
  }

  const heading = !compact ? (
    <div>
      <p className="font-display text-lg font-semibold tracking-tight">
        Request a track
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Repeat requests and upvotes move a song up the list.
      </p>
    </div>
  ) : null;

  if (spotifyConnected) {
    return (
      <div className="flex flex-col gap-3">
        {heading}
        <TrackSearch />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {heading}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="song-title">Song</Label>
        <Input
          id="song-title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Blinding Lights"
          maxLength={80}
          autoComplete="off"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="song-artist">Artist</Label>
        <Input
          id="song-artist"
          name="artist"
          value={artist}
          onChange={(event) => setArtist(event.target.value)}
          placeholder="The Weeknd"
          maxLength={80}
          autoComplete="off"
        />
      </div>
      <Button type="submit" disabled={request.isPending} className="mt-1">
        <Plus className="size-4" />
        {request.isPending ? "Sending" : "Send request"}
      </Button>
    </form>
  );
}
