import { useEffect, useMemo, useState } from "react";
import { encode } from "uqr";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEvent } from "@/components/event-provider";
import { buildPublicUrl, getShareBaseUrl } from "@/lib/site";

export function QrPanel() {
  const event = useEvent();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(buildPublicUrl(`/r/${event.slug ?? event.code}`, getShareBaseUrl()));
  }, [event.code, event.slug]);

  const qr = useMemo(() => {
    if (!url) return null;
    return encode(url, { border: 2, ecc: "M" });
  }, [url]);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Request link copied.");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the link.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share with the floor</CardTitle>
        <CardDescription>
          Guests scan this code, drop a track, and vote. Matching requests stack
          and rise in the queue.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="rounded-lg bg-primary p-3">
          {qr ? (
            <svg
              viewBox={`0 0 ${qr.size} ${qr.size}`}
              className="size-44 text-primary-foreground sm:size-52"
              role="img"
              aria-label="QR code for the song request page"
            >
              {qr.data.map((row, y) =>
                row.map((on, x) =>
                  on ? (
                    <rect
                      key={`${x}-${y}`}
                      x={x}
                      y={y}
                      width={1}
                      height={1}
                      fill="currentColor"
                    />
                  ) : null,
                ),
              )}
            </svg>
          ) : (
            <div className="size-44 bg-primary sm:size-52" />
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={copyLink}
          disabled={!url}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy request link"}
        </Button>
        <p className="text-center text-xs text-subtle">
          Public room link: {url || "loading..."}
        </p>
        <p className="text-center text-xs text-subtle">
          Room code{" "}
          <span className="font-display tracking-[0.2em] text-muted-foreground">
            {event.code}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
