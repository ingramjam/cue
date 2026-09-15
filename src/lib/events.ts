import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public event shape. Never carries Spotify tokens — see spotify/store.server.ts. */
export type EventSummary = {
  id: number;
  code: string;
  slug: string | null;
  name: string;
  spotifyConnected: boolean;
  spotifyDisplayName: string | null;
  spotifyPlaylistId: string | null;
};

export type EventRow = {
  id: number;
  code: string;
  slug: string | null;
  name: string;
  spotify_refresh_token: string | null;
  spotify_display_name: string | null;
  spotify_playlist_id: string | null;
};

const roomLookupSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((value) => value.trim());

// Ambiguous glyphs (0/O, 1/I/L) are omitted so a code read off a booth screen
// can't be mistyped into someone else's room.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

export function generateEventCode(): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = "";
  while (code.length < CODE_LENGTH) {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (code.length === CODE_LENGTH) break;
      if (byte >= limit) continue; // reject to keep the distribution uniform
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return code;
}

export function slugifyEventName(value: string | null | undefined): string {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return "night";

  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return slug || "night";
}

export function buildRoomSlug(value: string | null | undefined, fallback = "night"): string {
  const base = slugifyEventName(value || fallback);
  if (base !== fallback || !value) return base;
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export function toEventSummary(row: EventRow): EventSummary {
  return {
    id: Number(row.id),
    code: row.code,
    slug: row.slug,
    name: row.name,
    spotifyConnected: Boolean(row.spotify_refresh_token),
    spotifyDisplayName: row.spotify_display_name,
    spotifyPlaylistId: row.spotify_playlist_id,
  };
}

const EVENT_COLUMNS =
  "id, code, slug, name, spotify_refresh_token, spotify_display_name, spotify_playlist_id";

export const createEvent = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().max(60).optional() }))
  .handler(async ({ data }): Promise<EventSummary> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const name = (data.name ?? "").trim() || "Tonight";
    const slug = buildRoomSlug(name);

    const slugColumn = await sql<{ exists: boolean }>`
      select exists (
        select 1 from information_schema.columns
        where table_name = 'events' and column_name = 'slug'
      ) as exists
    `;
    const hasSlugColumn = Boolean(slugColumn[0]?.exists);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rows = await sql.query<EventRow>(
        hasSlugColumn
          ? `insert into events (code, slug, name) values ($1, $2, $3)
             on conflict (code) do nothing
             returning ${EVENT_COLUMNS}`
          : `insert into events (code, name) values ($1, $2)
             on conflict (code) do nothing
             returning ${EVENT_COLUMNS}`,
        hasSlugColumn ? [generateEventCode(), slug, name] : [generateEventCode(), name],
      );
      const row = rows[0];
      if (row) return toEventSummary(row);
    }
    throw new Error("Could not start a new night. Try again.");
  });

export const getEvent = createServerFn({ method: "GET" })
  .validator(z.object({ code: roomLookupSchema }))
  .handler(async ({ data }): Promise<EventSummary | null> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const lookup = data.code.trim();

    const slugColumn = await sql<{ exists: boolean }>`
      select exists (
        select 1 from information_schema.columns
        where table_name = 'events' and column_name = 'slug'
      ) as exists
    `;
    const hasSlugColumn = Boolean(slugColumn[0]?.exists);

    const rows = await sql.query<EventRow>(
      hasSlugColumn
        ? `select ${EVENT_COLUMNS} from events where lower(code) = lower($1) or lower(slug) = lower($1) limit 1`
        : `select ${EVENT_COLUMNS} from events where lower(code) = lower($1) limit 1`,
      [lookup],
    );
    return rows[0] ? toEventSummary(rows[0]) : null;
  });

/** Back-compat for the old `/request` link: hand guests the newest room. */
export const latestEvent = createServerFn({ method: "GET" }).handler(
  async (): Promise<EventSummary | null> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql.query<EventRow>(
      `select ${EVENT_COLUMNS} from events order by id desc limit 1`,
    );
    return rows[0] ? toEventSummary(rows[0]) : null;
  },
);

export const renameEvent = createServerFn({ method: "POST" })
  .validator(
    z.object({
      eventId: z.number().int().positive(),
      name: z.string().trim().min(1).max(60),
    }),
  )
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`update events set name = ${data.name} where id = ${data.eventId}`;
    return { ok: true as const };
  });

export const clearFloor = createServerFn({ method: "POST" })
  .validator(z.object({ eventId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`delete from songs where event_id = ${data.eventId}`;
    return { ok: true as const };
  });
