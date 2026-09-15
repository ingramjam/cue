import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { EventProvider } from "@/components/event-provider";
import { PageShell } from "@/components/page-shell";
import { QueueSection } from "@/components/queue-section";
import { RequestForm } from "@/components/request-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getEvent } from "@/lib/events";
import { VENMO_HANDLE, VENMO_URL } from "@/lib/constants";

export const Route = createFileRoute("/r/$code")({
  loader: async ({ params }) => {
    const event = await getEvent({ data: { code: params.code } });
    if (!event) throw notFound();
    return event;
  },
  component: RequestPage,
  notFoundComponent: () => (
    <PageShell>
      <p className="py-16 text-center text-sm text-muted-foreground">
        That room is closed. Ask the DJ for a fresh link.
      </p>
    </PageShell>
  ),
});

function RequestPage() {
  const event = Route.useLoaderData();

  return (
    <EventProvider event={event}>
      <PageShell>
        <AppHeader kicker={event.name} code={event.code} />
        <section className="flex flex-col gap-2">
          <h1 className="font-display text-4xl leading-none font-semibold tracking-tight sm:text-5xl">
            What should play next?
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
            Drop a track. If it is already in the queue, your request raises its
            priority. Upvote what you want to hear.
          </p>
        </section>
        <Card>
          <CardContent className="pt-5">
            <RequestForm />
          </CardContent>
        </Card>
        <QueueSection empty="The queue is empty. Be the first request of the night." />
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">
              Tip the DJ
            </p>
            <p className="text-sm text-muted-foreground">
              Fuel the booth on Venmo {VENMO_HANDLE}.
            </p>
          </div>
          <Button asChild className="shrink-0">
            <a href={VENMO_URL} target="_blank" rel="noopener noreferrer">
              Open Venmo
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
        <p className="text-center text-xs text-subtle">
          DJ?{" "}
          <Link
            to="/booth/$code"
            params={{ code: event.code }}
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Open the booth
          </Link>
        </p>
      </PageShell>
    </EventProvider>
  );
}
