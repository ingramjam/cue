import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppHeader } from "@/components/app-header";
import { EventProvider, rememberEvent } from "@/components/event-provider";
import { PageShell } from "@/components/page-shell";
import { QrPanel } from "@/components/qr-panel";
import { QueueSection } from "@/components/queue-section";
import { RequestForm } from "@/components/request-form";
import { SpotifyPanel } from "@/components/spotify-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getEvent } from "@/lib/events";

export const Route = createFileRoute("/booth/$code")({
  loader: async ({ params }) => {
    const event = await getEvent({ data: { code: params.code } });
    if (!event) throw notFound();
    return event;
  },
  component: Booth,
  notFoundComponent: () => (
    <PageShell>
      <p className="py-16 text-center text-sm text-muted-foreground">
        That room does not exist.{" "}
        <Link to="/" className="text-foreground underline-offset-4 hover:underline">
          Start a new night
        </Link>
        .
      </p>
    </PageShell>
  ),
});

function Booth() {
  const event = Route.useLoaderData();

  useEffect(() => {
    rememberEvent(event.code);
  }, [event.code]);

  return (
    <EventProvider event={event}>
      <PageShell>
        <AppHeader kicker="DJ booth" booth code={event.code} />
        <section className="flex flex-col gap-2">
          <h1 className="font-display text-4xl leading-none font-semibold tracking-tight sm:text-5xl">
            {event.name}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
            Put this screen on the booth. Guests scan the code, request songs, and
            vote. Duplicate requests stack and jump the track up the list.
          </p>
        </section>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-start">
          <QueueSection
            booth
            empty="No tracks waiting. Share the code or add the first request."
          />
          <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
            <QrPanel />
            <SpotifyPanel />
            <Card>
              <CardContent className="pt-5">
                <RequestForm />
              </CardContent>
            </Card>
          </aside>
        </div>
        <Separator />
        <p className="text-sm text-muted-foreground">
          Guest view:{" "}
          <Link
            to="/r/$code"
            params={{ code: event.code }}
            className="text-foreground underline-offset-4 hover:underline"
          >
            open the request page
          </Link>
          .
        </p>
      </PageShell>
    </EventProvider>
  );
}
