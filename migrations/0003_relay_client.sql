-- Which room a phone is in. WebSocket connections stay on one server;
-- ordinary requests can land anywhere, so the mapping cannot live in memory.
create table if not exists relay_client (
  client text primary key,
  code text not null
);

create index if not exists relay_client_code on relay_client (code);
