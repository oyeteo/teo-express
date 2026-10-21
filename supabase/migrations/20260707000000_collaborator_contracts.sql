-- Collaborator contracts storage and retention guidance for free-tier Supabase.
-- This gives append-only database records, content-addressed storage paths, and
-- seven-year retention metadata. Supabase free tier does not provide object lock,
-- so "WORM-style" here means application and SQL controls against mutation.

create extension if not exists pgcrypto;
create table if not exists public.collaborator_contract_packets (
  id text primary key,
  status text not null check (status in ('draft', 'sealed')),
  storage_provider text not null check (storage_provider in ('supabase', 'memory')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retain_until timestamptz not null,
  created_by_clerk_user_id text not null,
  authorized_clerk_user_id text null,
  collaborator_name text not null,
  collaborator_credit_name text null,
  collaborator_email text not null,
  song_id text null,
  song_title text not null,
  song_artist_name text null,
  ownership_basis_points integer not null check (ownership_basis_points > 0 and ownership_basis_points <= 10000),
  admin_note text null,
  contract_snapshot jsonb not null,
  contract_snapshot_hash text not null,
  draft_object_path text not null,
  draft_object_sha256 text not null,
  sealed_packet jsonb null,
  sealed_packet_hash text null,
  sealed_packet_object_path text null,
  signature_key_id text null,
  signed_at timestamptz null,
  signer_clerk_user_id text null,
  signer_email text null,
  last_verified_at timestamptz null
);
create index if not exists collaborator_contract_packets_email_idx
  on public.collaborator_contract_packets (lower(collaborator_email));
create index if not exists collaborator_contract_packets_status_idx
  on public.collaborator_contract_packets (status, retain_until);
create table if not exists public.collaborator_contract_events (
  id uuid primary key default gen_random_uuid(),
  contract_id text not null references public.collaborator_contract_packets(id) on delete restrict,
  event_type text not null,
  created_at timestamptz not null default now(),
  occurred_at timestamptz not null,
  previous_event_hash text null,
  event_hash text not null unique,
  payload jsonb not null
);
create index if not exists collaborator_contract_events_contract_idx
  on public.collaborator_contract_events (contract_id, created_at desc);
alter table public.collaborator_contract_packets enable row level security;
alter table public.collaborator_contract_events enable row level security;
drop policy if exists "no direct contract access" on public.collaborator_contract_packets;
create policy "no direct contract access" on public.collaborator_contract_packets
  for all
  to anon, authenticated
  using (false)
  with check (false);
drop policy if exists "no direct event access" on public.collaborator_contract_events;
create policy "no direct event access" on public.collaborator_contract_events
  for all
  to anon, authenticated
  using (false)
  with check (false);
create or replace function public.set_collaborator_contract_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists collaborator_contract_packets_updated_at
  on public.collaborator_contract_packets;
create trigger collaborator_contract_packets_updated_at
before update on public.collaborator_contract_packets
for each row
execute function public.set_collaborator_contract_updated_at();
create or replace function public.prevent_collaborator_contract_rewrites()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'sealed' then
    if new.status is distinct from old.status
      or new.storage_provider is distinct from old.storage_provider
      or new.created_at is distinct from old.created_at
      or new.retain_until is distinct from old.retain_until
      or new.created_by_clerk_user_id is distinct from old.created_by_clerk_user_id
      or new.authorized_clerk_user_id is distinct from old.authorized_clerk_user_id
      or new.collaborator_name is distinct from old.collaborator_name
      or new.collaborator_credit_name is distinct from old.collaborator_credit_name
      or new.collaborator_email is distinct from old.collaborator_email
      or new.song_id is distinct from old.song_id
      or new.song_title is distinct from old.song_title
      or new.song_artist_name is distinct from old.song_artist_name
      or new.ownership_basis_points is distinct from old.ownership_basis_points
      or new.admin_note is distinct from old.admin_note
      or new.contract_snapshot is distinct from old.contract_snapshot
      or new.contract_snapshot_hash is distinct from old.contract_snapshot_hash
      or new.draft_object_path is distinct from old.draft_object_path
      or new.draft_object_sha256 is distinct from old.draft_object_sha256
      or new.sealed_packet is distinct from old.sealed_packet
      or new.sealed_packet_hash is distinct from old.sealed_packet_hash
      or new.sealed_packet_object_path is distinct from old.sealed_packet_object_path
      or new.signature_key_id is distinct from old.signature_key_id
      or new.signed_at is distinct from old.signed_at
      or new.signer_clerk_user_id is distinct from old.signer_clerk_user_id
      or new.signer_email is distinct from old.signer_email then
      raise exception 'sealed collaborator contracts are immutable';
    end if;
  end if;

  if old.status = 'draft'
    and new.status = 'draft'
    and (
      new.retain_until is distinct from old.retain_until
      or new.authorized_clerk_user_id is distinct from old.authorized_clerk_user_id
      or new.status is distinct from old.status
      or
      new.contract_snapshot is distinct from old.contract_snapshot
      or new.contract_snapshot_hash is distinct from old.contract_snapshot_hash
      or new.draft_object_path is distinct from old.draft_object_path
      or new.draft_object_sha256 is distinct from old.draft_object_sha256
    ) then
    raise exception 'draft contract payloads are append-only; issue a new draft instead';
  end if;

  if old.status = 'draft'
    and new.status = 'sealed'
    and (
      new.retain_until is distinct from old.retain_until
      or new.contract_snapshot is distinct from old.contract_snapshot
      or new.contract_snapshot_hash is distinct from old.contract_snapshot_hash
      or new.draft_object_path is distinct from old.draft_object_path
      or new.draft_object_sha256 is distinct from old.draft_object_sha256
    ) then
    raise exception 'draft retention and snapshot fields cannot change during sealing';
  end if;

  return new;
end;
$$;
drop trigger if exists collaborator_contract_packets_immutable
  on public.collaborator_contract_packets;
create trigger collaborator_contract_packets_immutable
before update on public.collaborator_contract_packets
for each row
execute function public.prevent_collaborator_contract_rewrites();
create or replace function public.prevent_collaborator_contract_deletes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'collaborator contract records are append-only';
end;
$$;
drop trigger if exists collaborator_contract_packets_no_delete
  on public.collaborator_contract_packets;
create trigger collaborator_contract_packets_no_delete
before delete on public.collaborator_contract_packets
for each row
execute function public.prevent_collaborator_contract_deletes();
drop trigger if exists collaborator_contract_events_no_delete
  on public.collaborator_contract_events;
create trigger collaborator_contract_events_no_delete
before delete on public.collaborator_contract_events
for each row
execute function public.prevent_collaborator_contract_deletes();
drop trigger if exists collaborator_contract_events_no_update
  on public.collaborator_contract_events;
create trigger collaborator_contract_events_no_update
before update on public.collaborator_contract_events
for each row
execute function public.prevent_collaborator_contract_deletes();
-- Private bucket for sealed packets and contract snapshots.
insert into storage.buckets (id, name, public)
values ('collaborator-contract-packets', 'collaborator-contract-packets', false)
on conflict (id) do nothing;
-- Object path guidance:
--   draft/<contract_id>/<sha256>.json
--   sealed/<contract_id>/<sha256>.json
-- Store retain_until and hash references in the table above. On free tier,
-- do not overwrite or delete stored objects before retain_until; instead
-- issue a new object path if the contract changes before signing.;
