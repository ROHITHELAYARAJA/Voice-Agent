alter table public.journal_entries add column wellness jsonb not null default '[]'
  check (jsonb_typeof(wellness) = 'array' and jsonb_array_length(wellness) <= 32);

create table public.voice_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  journal_id uuid not null,
  value text not null check (length(value) between 1 and 1000),
  quote text not null check (length(quote) between 1 and 1500),
  permission_quote text not null check (length(permission_quote) between 1 and 500),
  created_at timestamptz not null default now(),
  foreign key (user_id,journal_id) references public.journal_entries(user_id,id) on delete cascade,
  unique (journal_id,value)
);
create index voice_memories_owner on public.voice_memories(user_id,created_at desc);
alter table public.voice_memories enable row level security;
create policy own_read on public.voice_memories for select to authenticated
  using (user_id=auth.uid() and private.is_active());
create policy own_delete on public.voice_memories for delete to authenticated
  using (user_id=auth.uid() and private.is_active());
revoke all on public.voice_memories from anon,authenticated;
grant select,delete on public.voice_memories to authenticated;
grant all on public.voice_memories to service_role;
create trigger notify_owner after insert or update or delete on public.voice_memories
  for each row execute function private.notify_owner();

revoke insert,update on public.mood_entries from authenticated;
revoke insert,update on public.journal_entries from authenticated;
revoke update(title,user_edit) on public.journal_entries from authenticated;
revoke insert,update on public.self_care_activities,public.self_care_goals,public.challenge_progress from authenticated;
