/** Dedupe key for a request. Shared by song writes and Spotify auto-matching. */
export function normalizeKey(title: string, artist: string): string {
  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${clean(title)}|${clean(artist)}`;
}

/** Strips the mix/remaster noise Spotify titles carry but guests never type. */
export function looseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*[([][^)\]]*(remaster|version|edit|mix|live|mono|stereo)[^)\]]*[)\]]/g, "")
    .replace(/\s*-\s*(remaster|remastered|radio edit|single version).*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
