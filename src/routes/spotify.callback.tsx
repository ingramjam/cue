import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { connectSpotify } from "@/lib/spotify";
import { takePendingAuth } from "@/lib/spotify/pkce";

export const Route = createFileRoute("/spotify/callback")({
  component: SpotifyCallback,
});

function SpotifyCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const pending = takePendingAuth();
    const denied = params.get("error");
    const code = params.get("code");
    const state = params.get("state");

    if (denied) {
      setError(`Spotify authorization was cancelled (${denied}).`);
      return;
    }
    if (!pending) {
      setError("This connection link has expired. Start again from the booth.");
      return;
    }
    // Reject a code that came back with a state we did not issue.
    if (!code || state !== pending.state) {
      setError("That response did not match this browser session.");
      return;
    }

    void connectSpotify({
      data: {
        eventId: pending.eventId,
        code,
        codeVerifier: pending.verifier,
        redirectUri: pending.redirectUri,
      },
    })
      .then(() => {
        toast.success("Spotify connected.");
        return navigate({
          to: "/booth/$code",
          params: { code: pending.eventCode },
          replace: true,
        });
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Could not finish connecting Spotify.",
        );
      });
  }, [navigate]);

  return (
    <PageShell>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        {error ? (
          <>
            <p className="font-display text-xl font-semibold tracking-tight">
              Spotify could not connect
            </p>
            <p className="max-w-md text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Connecting Spotify…</p>
          </>
        )}
      </div>
    </PageShell>
  );
}
