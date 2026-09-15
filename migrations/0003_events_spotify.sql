create table if not exists events (
  id serial primary key,
  code text not null unique,
  slug text,
  name text not null default 'Tonight',
  created_at timestamptz not null default now(),
  spotify_client_id text,
  spotify_access_token text,
  spotify_refresh_token text,
  spotify_expires_at timestamptz,
  spotify_user_id text,
  spotify_display_name text,
  spotify_playlist_id text,
  spotify_playlist_synced_key text
);

create unique index if not exists events_slug_idx on events (slug) where slug is not null;

alter table songs add column if not exists event_id integer references events (id) on delete cascade;
alter table songs add column if not exists spotify_track_id text;
alter table songs add column if not exists spotify_uri text;
alter table songs add column if not exists album_art_url text;
alter table songs add column if not exists duration_ms integer;

-- Adopt any pre-rooms songs into one legacy event so event_id can go not-null.
insert into events (code, name)
select upper(substr(md5(random()::text), 1, 8)), 'Opening night'
where exists (select 1 from songs where event_id is null);

update songs
set event_id = (select min(id) from events)
where event_id is null;

alter table songs alter column event_id set not null;

-- Dedupe is per-room now, so the same track can live in two nights at once.
alter table songs drop constraint if exists songs_normalized_key_key;
create unique index if not exists songs_event_key_idx on songs (event_id, normalized_key);
create index if not exists songs_event_status_idx on songs (event_id, status);

create table if not exists now_playing_cache (
  event_id integer primary key references events (id) on delete cascade,
  track_id text,
  title text not null default '',
  artist text not null default '',
  album_art_url text,
  duration_ms integer,
  progress_ms integer,
  is_playing boolean not null default false,
  device_name text,
  fetched_at timestamptz not null default now(),
  failed_at timestamptz
);

create table if not exists rate_limits (
  bucket text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);
