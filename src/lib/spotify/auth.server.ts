const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

export const SPOTIFY_SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-modify-private",
  "playlist-read-private",
].join(" ");

/** Refresh this far ahead of expiry so an in-flight request can't race it. */
const EXPIRY_SKEW_MS = 60_000;

export class SpotifyNotConnectedError extends Error {
  constructor(message = "Spotify is not connected for this room.") {
    super(message);
    this.name = "SpotifyNotConnectedError";
  }
}

export type SpotifyRow = {
  id: number;
  spotify_client_id: string | null;
  spotify_access_token: string | null;
  spotify_refresh_token: string | null;
  spotify_expires_at: Date | string | null;
  spotify_user_id: string | null;
  spotify_display_name: string | null;
  spotify_playlist_id: string | null;
  spotify_playlist_synced_key: string | null;
};

const COLUMNS =
  "id, spotify_client_id, spotify_access_token, spotify_refresh_token, " +
  "spotify_expires_at, spotify_user_id, spotify_display_name, " +
  "spotify_playlist_id, spotify_playlist_synced_key";

export async function readSpotifyRow(eventId: number): Promise<SpotifyRow | null> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<SpotifyRow>(
    `select ${COLUMNS} from events where id = $1`,
    [eventId],
  );
  return rows[0] ?? null;
}

export async function setClientId(eventId: number, clientId: string): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`update events set spotify_client_id = ${clientId} where id = ${eventId}`;
}

export async function setPlaylistId(
  eventId: number,
  playlistId: string | null,
): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`
    update events set
      spotify_playlist_id = ${playlistId},
      spotify_playlist_synced_key = null
    where id = ${eventId}
  `;
}

/** Mark the cached access token stale so the next read refreshes it. */
export async function invalidateAccessToken(eventId: number): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`update events set spotify_expires_at = null where id = ${eventId}`;
}

export async function disconnectSpotify(eventId: number): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`
    update events set
      spotify_access_token = null,
      spotify_refresh_token = null,
      spotify_expires_at = null,
      spotify_user_id = null,
      spotify_display_name = null,
      spotify_playlist_id = null,
      spotify_playlist_synced_key = null
    where id = ${eventId}
  `;
  await sql`delete from now_playing_cache where event_id = ${eventId}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as {
        error?: string;
        error_description?: string;
      };
      detail = parsed.error_description || parsed.error || text;
    } catch {
      // keep the raw body
    }
    throw new Error(`Spotify rejected the connection: ${detail}`);
  }
  return JSON.parse(text) as TokenResponse;
}

async function persistTokens(
  eventId: number,
  tokens: TokenResponse,
  fallbackRefreshToken: string | null,
): Promise<string> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  // PKCE rotates the refresh token on most refreshes; dropping the new one
  // silently kills the connection an hour later.
  const refreshToken = tokens.refresh_token ?? fallbackRefreshToken;
  await sql`
    update events set
      spotify_access_token = ${tokens.access_token},
      spotify_refresh_token = ${refreshToken},
      spotify_expires_at = ${expiresAt}
    where id = ${eventId}
  `;
  return tokens.access_token;
}

export async function exchangeCode(input: {
  eventId: number;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ displayName: string | null }> {
  const tokens = await postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.clientId,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
  );
  await persistTokens(input.eventId, tokens, null);

  const profile = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  let userId: string | null = null;
  let displayName: string | null = null;
  if (profile.ok) {
    const me = (await profile.json()) as {
      id?: string;
      display_name?: string | null;
    };
    userId = me.id ?? null;
    displayName = me.display_name ?? me.id ?? null;
  }

  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`
    update events set
      spotify_client_id = ${input.clientId},
      spotify_user_id = ${userId},
      spotify_display_name = ${displayName}
    where id = ${input.eventId}
  `;
  return { displayName };
}

/**
 * A valid bearer token for the room, refreshing when it is close to expiry.
 * Server-only — the token must never be returned to a client.
 */
export async function getAccessToken(eventId: number): Promise<string> {
  const row = await readSpotifyRow(eventId);
  if (!row?.spotify_refresh_token || !row.spotify_client_id) {
    throw new SpotifyNotConnectedError();
  }

  const expiresAt = row.spotify_expires_at
    ? new Date(row.spotify_expires_at).getTime()
    : 0;
  if (row.spotify_access_token && expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return row.spotify_access_token;
  }

  const tokens = await postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: row.spotify_client_id,
      refresh_token: row.spotify_refresh_token,
    }),
  );
  return persistTokens(eventId, tokens, row.spotify_refresh_token);
}
