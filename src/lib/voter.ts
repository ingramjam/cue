const VOTER_KEY = "cue-voter-id";

export function getVoterId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(VOTER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(VOTER_KEY, id);
  }
  return id;
}
