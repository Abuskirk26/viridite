-- Lockstep rooms shared by every server instance. No accounts.
create table if not exists relay_room (
  code text primary key,
  ver integer not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists relay_out (
  id bigserial primary key,
  client text not null,
  body jsonb not null,
  at timestamptz not null default now()
);

create index if not exists relay_out_client_id on relay_out (client, id);
