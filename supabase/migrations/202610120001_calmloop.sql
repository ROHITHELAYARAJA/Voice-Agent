create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 80),
  timezone text not null default 'Asia/Kolkata',
  onboarding_complete boolean not null default false,
  suspended boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.account_roles (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null check (role in ('admin','customer')), primary key(user_id,role)
);
create table private.encrypted_credentials (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  provider text not null check(provider in ('twilio','deepgram','elevenlabs')),
  envelope jsonb not null, key_version text not null, created_at timestamptz not null default now(),
  unique(user_id,id), unique(user_id,provider)
);
create table public.provider_connections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  provider text not null check(provider in ('twilio','deepgram','elevenlabs')),
  credential_id uuid not null, status text not null check(status in ('connected','failed','disconnected')),
  label text not null, capabilities jsonb not null default '{}', verified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,provider), foreign key(user_id,credential_id) references private.encrypted_credentials(user_id,id) on delete cascade
);
create table public.verified_phone_numbers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  phone_number text not null check(phone_number ~ '^\+[1-9][0-9]{7,14}$'), masked_number text not null,
  verified_at timestamptz not null, created_at timestamptz not null default now(), unique(user_id,id), unique(user_id,phone_number)
);
create table public.consent_records (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  recurring_calls boolean not null, transcription boolean not null, adult boolean not null check(adult),
  recording boolean not null default false check(not recording), policy_version text not null,
  created_at timestamptz not null default now()
);
create table public.call_preferences (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  language text not null default 'en' check(language in ('auto','en','hi','es','fr','de','ta')),
  voice_id text not null default 'cgSgspJ2msm6clMCkdW9', retain_transcript boolean not null default false,
  recording_enabled boolean not null default false check(not recording_enabled),
  retention_days integer not null default 30 check(retention_days between 1 and 90), updated_at timestamptz not null default now()
);
create table public.call_schedules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  phone_id uuid not null, local_time text not null check(local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone text not null, weekdays integer[] not null check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]),
  enabled boolean not null default false, next_call_at_utc timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(user_id,id), unique(user_id),
  foreign key(user_id,phone_id) references public.verified_phone_numbers(user_id,id) on delete cascade
);
create table public.call_jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  schedule_id uuid, occurrence_at timestamptz not null, next_attempt_at timestamptz not null default now(),
  status text not null default 'queued' check(status in ('queued','claimed','sending','uncertain','sent','canceled','failed')),
  attempts integer not null default 0, lease_until timestamptz, claim_token uuid,
  last_error_code text, created_at timestamptz not null default now(), unique(user_id,id),
  unique(schedule_id,occurrence_at), foreign key(user_id,schedule_id) references public.call_schedules(user_id,id) on delete cascade
);
create table public.call_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  job_id uuid not null unique, call_sid text unique,
  destination_number text, caller_number text,
  error_code text check(length(error_code)<=64),
  status text not null default 'queued' check(status in ('queued','sending','uncertain','initiated','ringing','in-progress','completed','busy','no-answer','failed','canceled')),
  spoken_consent boolean not null default false, generation integer not null default 0,
  stream_owner uuid, stream_lease_until timestamptz,
  created_at timestamptz not null default now(), finished_at timestamptz,
  unique(user_id,id), foreign key(user_id,job_id) references public.call_jobs(user_id,id) on delete cascade
);
create table private.call_transcripts (
  session_id uuid primary key references public.call_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  turns jsonb not null, expires_at timestamptz not null,
  foreign key(user_id,session_id) references public.call_sessions(user_id,id) on delete cascade
);
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  session_id uuid unique, entry_date date not null, title text not null check(length(title)<=120),
  reflection text not null check(length(reflection)<=10000), user_edit text check(length(user_edit)<=10000),
  source text not null check(source in ('manual','voice')), topics text[] not null default '{}',
  statements jsonb not null default '[]' check(jsonb_typeof(statements)='array'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,id),
  foreign key(user_id,session_id) references public.call_sessions(user_id,id) on delete cascade
);
create table public.mood_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  journal_id uuid, entry_date date not null, score integer not null check(score between 1 and 10),
  tags text[] not null default '{}', source text not null check(source in ('manual','voice')),
  created_at timestamptz not null default now(), unique(user_id,entry_date),
  foreign key(user_id,journal_id) references public.journal_entries(user_id,id) on delete set null (journal_id)
);
create table public.stress_topics (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  journal_id uuid not null, topic text not null check(length(topic)<=60), evidence text not null check(length(evidence)<=2000),
  created_at timestamptz not null default now(), foreign key(user_id,journal_id) references public.journal_entries(user_id,id) on delete cascade,
  unique(journal_id,topic)
);
create table public.self_care_activities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  activity_key text not null, completed_at timestamptz not null default now()
);
create table public.self_care_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null check(length(title)<=160), completed boolean not null default false, created_at timestamptz not null default now()
);
create table public.challenge_progress (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  cycle uuid not null, day integer not null check(day between 1 and 30),
  status text not null check(status in ('completed','skipped')), updated_at timestamptz not null default now(), primary key(user_id,cycle,day)
);
create table public.weekly_insights (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
  week_start date not null, report jsonb not null, created_at timestamptz not null default now(), unique(user_id,week_start)
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(user_id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null, action text not null,
  metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.platform_settings (
  key text primary key, enabled boolean not null default false, updated_at timestamptz not null default now()
);
insert into public.platform_settings(key,enabled) values ('calling',false),('recording',false);

create index call_jobs_due on public.call_jobs(next_attempt_at,occurrence_at) where status='queued';
create index schedules_due on public.call_schedules(next_call_at_utc) where enabled;
create index consent_latest on public.consent_records(user_id,created_at desc);
create index journals_owner_date on public.journal_entries(user_id,entry_date desc);
create index calls_owner_date on public.call_sessions(user_id,created_at desc);
create index activities_owner_date on public.self_care_activities(user_id,completed_at desc);
create index topics_owner on public.stress_topics(user_id,topic);
create or replace function private.invalidate_recap() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.weekly_insights where user_id=coalesce(new.user_id,old.user_id); if TG_OP='DELETE' then return old; end if; return new; end; $$;
create trigger invalidate_journal_recap after update or delete on public.journal_entries for each row execute function private.invalidate_recap();
create trigger invalidate_mood_recap after insert or update or delete on public.mood_entries for each row execute function private.invalidate_recap();

create or replace function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(user_id,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'name',''),80));
  insert into public.account_roles(user_id,role) values(new.id,'customer');
  insert into public.call_preferences(user_id) values(new.id);
  return new;
end; $$;
create trigger calmloop_new_user after insert on auth.users for each row execute function private.create_profile();

create or replace function private.is_active() returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.profiles where user_id=auth.uid() and not suspended)
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_active() to authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','account_roles','provider_connections','verified_phone_numbers','consent_records','call_preferences','call_schedules','call_jobs','call_sessions','mood_entries','journal_entries','stress_topics','self_care_activities','self_care_goals','challenge_progress','weekly_insights','audit_logs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy own_read on public.%I for select to authenticated using(user_id=auth.uid() and private.is_active())',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
  foreach t in array array['self_care_activities','self_care_goals','challenge_progress'] loop
    execute format('create policy own_write on public.%I for all to authenticated using(user_id=auth.uid() and private.is_active()) with check(user_id=auth.uid() and private.is_active())',t);
  end loop;
end; $$;

create policy own_mood_write on public.mood_entries for all to authenticated using(user_id=auth.uid() and private.is_active()) with check(user_id=auth.uid() and source='manual' and private.is_active());
create policy manual_journal_insert on public.journal_entries for insert to authenticated with check(user_id=auth.uid() and source='manual' and session_id is null and private.is_active());
create policy own_journal_edit on public.journal_entries for update to authenticated using(user_id=auth.uid() and private.is_active()) with check(user_id=auth.uid() and private.is_active());
create policy own_journal_delete on public.journal_entries for delete to authenticated using(user_id=auth.uid() and private.is_active());

revoke all on all tables in schema public from anon;
revoke insert,update,delete on all tables in schema public from authenticated;
grant insert,update,delete on public.mood_entries,public.self_care_activities,public.self_care_goals,public.challenge_progress to authenticated;
grant insert,delete on public.journal_entries to authenticated;
grant update(title,user_edit) on public.journal_entries to authenticated;
alter table public.platform_settings enable row level security;
create policy platform_read on public.platform_settings for select to authenticated using(private.is_active());
grant select on public.platform_settings to authenticated;
alter table private.encrypted_credentials enable row level security;
alter table private.call_transcripts enable row level security;
revoke all on all tables in schema private from anon,authenticated;
grant all on all tables in schema public,private to service_role;
grant usage on schema private to service_role;

create or replace function private.notify_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; begin
  owner:=coalesce(new.user_id,old.user_id);
  perform realtime.send(jsonb_build_object('resource',TG_TABLE_NAME),'changed','user:'||owner::text,true);
  if TG_OP='DELETE' then return old; end if; return new;
end; $$;
do $$ declare t text; begin
foreach t in array array['call_sessions','mood_entries','journal_entries','call_schedules','challenge_progress','self_care_activities','provider_connections','weekly_insights'] loop
execute format('create trigger notify_owner after insert or update or delete on public.%I for each row execute function private.notify_owner()',t);
end loop; end; $$;
create policy calmloop_private_receive on realtime.messages for select to authenticated using(
  extension='broadcast' and realtime.topic()='user:'||auth.uid()::text and private.is_active()
);

create or replace function public.claim_call_jobs(batch_size integer default 10) returns setof public.call_jobs
language plpgsql security definer set search_path='' as $$
begin
  update public.call_jobs set status='uncertain',lease_until=null,last_error_code='LEASE_EXPIRED_AFTER_SEND' where status='sending' and lease_until<now();
  update public.call_jobs set status='queued',claim_token=null,lease_until=null where status='claimed' and lease_until<now() and attempts<3;
  update public.call_jobs set status='failed',lease_until=null,last_error_code='ATTEMPTS_EXHAUSTED' where status='claimed' and lease_until<now() and attempts>=3;
  return query with due as (
    select id from public.call_jobs where status='queued' and occurrence_at<=now() and next_attempt_at<=now() and attempts<3
    order by occurrence_at for update skip locked limit least(greatest(batch_size,1),50)
  ) update public.call_jobs j set status='claimed',attempts=attempts+1,lease_until=now()+interval '2 minutes',claim_token=gen_random_uuid()
    from due where j.id=due.id returning j.*;
end; $$;
revoke all on function public.claim_call_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_call_jobs(integer) to service_role;
