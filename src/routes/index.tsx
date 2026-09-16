import { createFileRoute } from "@tanstack/react-router";
import { Disc3 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { APP_TAGLINE } from "@/lib/constants";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <PageShell>
      <AppHeader />
      <main className="flex min-h-[calc(100dvh-7rem)] items-center justify-center">
        <section className="flex w-full max-w-3xl flex-col items-center gap-6 rounded-[2rem] border border-border/80 bg-card/70 px-6 py-16 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_32px_80px_rgba(0,0,0,0.35)] backdrop-blur sm:px-10 sm:py-24">
          <div className="flex size-16 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
            <Disc3 className="size-7" />
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium tracking-[0.3em] text-muted-foreground uppercase">
              {APP_TAGLINE}
            </p>
            <h1 className="font-display text-4xl leading-none font-semibold tracking-tight sm:text-6xl">
              Blank slate.
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              CUE is getting a fresh front door. For now, booth and request links
              still work when shared directly during the set.
            </p>
          </div>
        </section>
      </main>
    </PageShell>
  );
}
