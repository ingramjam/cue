import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  ExternalLink,
  ListMusic,
  Loader2,
  RefreshCw,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useEvent } from "@/components/event-provider";
import {
  disconnectSpotifyAccount,
  getSpotifyConfig,
  listSpotifyPlaylists,
  saveSpotifyClientId,
  setSpotifyPlaylist,
  spotifyDiagnostics,
  syncSpotifyPlaylist,
} from "@/lib/spotify";
import { beginSpotifyAuth, spotifyRedirectUri } from "@/lib/spotify/pkce";

const DASHBOARD_URL = "https://developer.spotify.com/dashboard";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied.`);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy that.");
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
      <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {value}
      </code>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Copy ${label}`}
        onClick={copy}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

export function SpotifyPanel() {
  const event = useEvent();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");

  useEffect(() => {
    setRedirectUri(spotifyRedirectUri());
  }, []);

  const config = useQuery({
    queryKey: ["spotify-config", event.id],
    queryFn: () => getSpotifyConfig({ data: { eventId: event.id } }),
  });

  const diagnostics = useQuery({
    queryKey: ["spotify-diagnostics", event.id],
    queryFn: () => spotifyDiagnostics({ data: { eventId: event.id } }),
    enabled: showDiagnostics,
    refetchInterval: showDiagnostics ? 5000 : false,
  });
  const connected = config.data?.connected ?? false;

  const disconnect = useMutation({
    mutationFn: () => disconnectSpotifyAccount({ data: { eventId: event.id } }),
    onSuccess: () => {
      toast.success("Spotify disconnected.");
      void queryClient.invalidateQueries({ queryKey: ["spotify-config", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["queue", event.id] });
    },
  });

  const sync = useMutation({
    mutationFn: () => syncSpotifyPlaylist({ data: { eventId: event.id } }),
    onSuccess: (result) => {
      toast.success(
        result.playlistId
          ? "Playlist synced — open it in djay Pro."
          : "Nothing to sync yet.",
      );
      void queryClient.invalidateQueries({ queryKey: ["spotify-config", event.id] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not sync."),
  });

  const connect = useMutation({
    mutationFn: async (id: string) => {
      await saveSpotifyClientId({ data: { eventId: event.id, clientId: id } });
      await beginSpotifyAuth({
        eventId: event.id,
        eventCode: event.code,
        clientId: id,
        scopes: config.data?.scopes ?? "",
      });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not start the Spotify connection.",
      ),
  });

  const playlists = useQuery({
    queryKey: ["spotify-playlists", event.id],
    queryFn: () => listSpotifyPlaylists({ data: { eventId: event.id } }),
    enabled: connected,
  });

  const selectPlaylist = useMutation({
    mutationFn: (playlistId: string | null) =>
      setSpotifyPlaylist({ data: { eventId: event.id, playlistId } }),
    onSuccess: (result) => {
      toast.success(
        result.imported > 0
          ? `Playlist selected — added ${result.imported} tracks to On deck.`
          : "Playlist selection updated.",
      );
      void queryClient.invalidateQueries({ queryKey: ["spotify-config", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["spotify-playlists", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["queue", event.id] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update playlist."),
  });

  const uri = redirectUri;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListMusic className="size-4" />
          Spotify
        </CardTitle>
        <CardDescription>
          {connected
            ? "Now playing, search, and the mirrored playlist are live."
            : "Connect once to unlock live now-playing and track search."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {config.isLoading ? (
          <div className="h-20 animate-pulse rounded-lg bg-secondary" />
        ) : connected ? (
          <>
            <p className="text-sm text-muted-foreground">
              Connected as{" "}
              <span className="font-medium text-foreground">
                {config.data?.displayName ?? "your Spotify account"}
              </span>
              .
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
              >
                {sync.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Sync playlist
              </Button>
              {config.data?.playlistId ? (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`https://open.spotify.com/playlist/${config.data.playlistId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open playlist
                    <ExternalLink className="size-3.5 opacity-70" />
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDiagnostics((value) => !value)}
              >
                <Stethoscope className="size-4" />
                {showDiagnostics ? "Hide" : "Diagnostics"}
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="spotify-playlist-id">Playlist for this room</Label>
              <select
                id="spotify-playlist-id"
                value={config.data?.playlistId ?? ""}
                onChange={(e) => selectPlaylist.mutate(e.target.value || null)}
                className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                disabled={selectPlaylist.isPending || playlists.isLoading}
              >
                <option value="">Auto-create room playlist</option>
                {(playlists.data ?? []).map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.name} · {playlist.trackCount} tracks
                    {playlist.ownerName ? ` · ${playlist.ownerName}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-subtle">
                Selecting a playlist pulls its tracks into On deck so guests can vote.
              </p>
            </div>

            <p className="text-xs text-subtle">
              Mixing in djay Pro? Open the synced playlist inside djay to see
              requests in vote order.
            </p>

            {showDiagnostics ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/30 p-3">
                {diagnostics.isFetching && !diagnostics.data ? (
                  <p className="text-xs text-muted-foreground">Reading playback…</p>
                ) : diagnostics.data ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-subtle">Playing</dt>
                    <dd className="text-muted-foreground">
                      {diagnostics.data.isPlaying === null
                        ? "—"
                        : String(diagnostics.data.isPlaying)}
                    </dd>
                    <dt className="text-subtle">Device</dt>
                    <dd className="truncate text-muted-foreground">
                      {diagnostics.data.deviceName ?? "none"}
                      {diagnostics.data.deviceType
                        ? ` (${diagnostics.data.deviceType})`
                        : ""}
                    </dd>
                    <dt className="text-subtle">Track</dt>
                    <dd className="truncate text-muted-foreground">
                      {diagnostics.data.trackTitle ?? "—"}
                    </dd>
                    <dt className="text-subtle">Type</dt>
                    <dd className="text-muted-foreground">
                      {diagnostics.data.currentlyPlayingType ?? "—"}
                    </dd>
                    {diagnostics.data.message ? (
                      <>
                        <dt className="text-subtle">Note</dt>
                        <dd className="text-muted-foreground">
                          {diagnostics.data.message}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                ) : null}
                <p className="text-xs text-subtle">
                  If djay Pro playback shows no device here, it is invisible to
                  Spotify's API — use the synced playlist instead.
                </p>
              </div>
            ) : null}

            <Separator />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              Disconnect Spotify
            </Button>
          </>
        ) : (
          <>
            <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li>
                1. Create an app in the{" "}
                <a
                  href={DASHBOARD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Spotify developer dashboard
                </a>
                .
              </li>
              <li>2. Add this exact redirect URI to the app settings:</li>
            </ol>
            {uri ? <CopyField label="Redirect URI" value={uri} /> : null}
            <p className="text-xs text-subtle">
              It must match character for character. Spotify rejects{" "}
              <code>localhost</code> — use <code>127.0.0.1</code> for local work,
              and add your deployed https URL too.
            </p>
            <ol className="flex flex-col gap-2 text-sm text-muted-foreground" start={3}>
              <li>3. Copy the app's Client ID and paste it here.</li>
            </ol>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="spotify-client-id">Client ID</Label>
              <Input
                id="spotify-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="32-character client ID"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <Button
              type="button"
              onClick={() => connect.mutate(clientId.trim())}
              disabled={connect.isPending || clientId.trim().length < 32}
            >
              {connect.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Connect Spotify
            </Button>
            <p className="text-xs text-subtle">
              Your account needs Premium. Only you sign in — guests never do.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
