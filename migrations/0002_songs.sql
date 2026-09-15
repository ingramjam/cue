create table if not exists songs (
  id serial primary key,
  title text not null,
  artist text not null default '',
  normalized_key text not null unique,
  request_count integer not null default 1,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  last_requested_at timestamptz not null default now(),
  constraint songs_status_check check (status in ('queued', 'playing', 'played'))
);

create index if not exists songs_status_idx on songs (status);

create table if not exists votes (
  id serial primary key,
  song_id integer not null references songs (id) on delete cascade,
  voter_id text not null,
  value integer not null,
  created_at timestamptz not null default now(),
  constraint votes_value_check check (value in (-1, 1)),
  unique (song_id, voter_id)
);

create index if not exists votes_voter_idx on votes (voter_id);
