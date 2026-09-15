import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public event shape. Never carries Spotify tokens — see spotify/store.server.ts. */
export type EventSummary = {
  id: number;
  code: string;
  name: string;
  spotifyConnected: boolean;
  spotifyDisplayName: string | null;
  spotifyPlaylistId: string | null;
};

export type EventRow = {
  id: number;
  code: string;
  name: string;
  spotify_refresh_token: string | null;
  spotify_display_name: string | null;
  spotify_playlist_id: string | null;
};

const codeSchema = z
  .string()
  .trim()
  .min(4)
  .max(16)
  .transform((value) => value.toUpperCase());

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

export function toEventSummary(row: EventRow): EventSummary {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    spotifyConnected: Boolean(row.spotify_refresh_token),
    spotifyDisplayName: row.spotify_display_name,
    spotifyPlaylistId: row.spotify_playlist_id,
  };
}

const EVENT_COLUMNS =
  "id, code, name, spotify_refresh_token, spotify_display_name, spotify_playlist_id";

export const createEvent = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().max(60).optional() }))
  .handler(async ({ data }): Promise<EventSummary> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const name = data.name?.trim() || "Tonight";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rows = await sql.query<EventRow>(
        `insert into events (code, name) values ($1, $2)
         on conflict (code) do nothing
         returning ${EVENT_COLUMNS}`,
        [generateEventCode(), name],
      );
      const row = rows[0];
      if (row) return toEventSummary(row);
    }
    throw new Error("Could not start a new night. Try again.");
  });

export const getEvent = createServerFn({ method: "GET" })
  .validator(z.object({ code: codeSchema }))
  .handler(async ({ data }): Promise<EventSummary | null> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql.query<EventRow>(
      `select ${EVENT_COLUMNS} from events where code = $1`,
      [data.code],
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
