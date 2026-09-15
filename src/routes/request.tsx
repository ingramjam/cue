import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { latestEvent } from "@/lib/events";

// Kept so links and QR codes printed before rooms existed still land somewhere.
export const Route = createFileRoute("/request")({
  loader: async () => {
    const event = await latestEvent();
    if (event) {
      throw redirect({ to: "/r/$code", params: { code: event.code } });
    }
    return null;
  },
  component: NoRoom,
});

function NoRoom() {
  return (
    <PageShell>
      <p className="py-16 text-center text-sm text-muted-foreground">
        No room is open yet. Ask the DJ to start the night.
      </p>
    </PageShell>
  );
}
