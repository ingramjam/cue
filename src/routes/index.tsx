import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Disc3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { recallEvent, rememberEvent } from "@/components/event-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createEvent, getEvent } from "@/lib/events";
import { APP_TAGLINE } from "@/lib/constants";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [previousBooth, setPreviousBooth] = useState<string | null>(null);

  useEffect(() => {
    setPreviousBooth(recallEvent());
  }, []);

  const start = useMutation({
    mutationFn: () => createEvent({ data: { name } }),
    onSuccess: (event) => {
      rememberEvent(event.code);
      void navigate({ to: "/booth/$code", params: { code: event.code } });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not start the night.",
      ),
  });

  const join = useMutation({
    mutationFn: (value: string) => getEvent({ data: { code: value } }),
    onSuccess: (event) => {
      if (!event) {
        toast.error("No room with that code.");
        return;
      }
      void navigate({ to: "/r/$code", params: { code: event.code } });
    },
    onError: () => toast.error("No room with that code."),
  });

  function onJoin(event: FormEvent) {
    event.preventDefault();
    const value = code.trim().toUpperCase();
    if (value.length < 4) {
      toast.error("Enter the room code from the booth.");
      return;
    }
    join.mutate(value);
  }

  return (
    <PageShell>
      <AppHeader />
      <section className="flex flex-col gap-3 pt-6">
        <h1 className="font-display text-4xl leading-none font-semibold tracking-tight sm:text-5xl">
          {APP_TAGLINE}
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
          Start a room for tonight, put the QR code on the booth, and let the
          floor request and vote on what plays next.
        </p>
      </section>

      <div className="flex max-w-md flex-col gap-2">
        <Label htmlFor="event-name">Booth name</Label>
        <Input
          id="event-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="DJ Jimmy Jams"
          maxLength={60}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <Button
        type="button"
        size="lg"
        className="self-start"
        onClick={() => start.mutate()}
        disabled={start.isPending}
      >
        {start.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Disc3 className="size-4" />
        )}
        Start the night
      </Button>
      {previousBooth ? (
        <p className="text-sm text-muted-foreground">
          Continue your last booth?{" "}
          <Link
            to="/booth/$code"
            params={{ code: previousBooth }}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Open it
          </Link>
          .
        </p>
      ) : null}

      <Separator />

      <form onSubmit={onJoin} className="flex max-w-sm flex-col gap-2">
        <Label htmlFor="room-code">Have a room code?</Label>
        <div className="flex gap-2">
          <Input
            id="room-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD2345"
            maxLength={16}
            autoComplete="off"
            spellCheck={false}
            className="tracking-[0.2em] uppercase"
          />
          <Button type="submit" variant="secondary" disabled={join.isPending}>
            Join
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
