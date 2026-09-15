import { createContext, useContext, type ReactNode } from "react";
import type { EventSummary } from "@/lib/events";

const EventContext = createContext<EventSummary | null>(null);

export function EventProvider({
  event,
  children,
}: {
  event: EventSummary;
  children: ReactNode;
}) {
  return <EventContext.Provider value={event}>{children}</EventContext.Provider>;
}

/** The room the current page belongs to. Every queue read and write is scoped to it. */
export function useEvent(): EventSummary {
  const event = useContext(EventContext);
  if (!event) {
    throw new Error("useEvent must be used inside an <EventProvider>.");
  }
  return event;
}

const LAST_EVENT_KEY = "cue-last-event";

export function rememberEvent(code: string): void {
  try {
    window.localStorage.setItem(LAST_EVENT_KEY, code);
  } catch {
    // Private-mode storage failures should never block the booth.
  }
}

export function recallEvent(): string | null {
  try {
    return window.localStorage.getItem(LAST_EVENT_KEY);
  } catch {
    return null;
  }
}

export function forgetEvent(): void {
  try {
    window.localStorage.removeItem(LAST_EVENT_KEY);
  } catch {
    // ignore
  }
}
