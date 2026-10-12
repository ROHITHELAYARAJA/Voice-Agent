create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.call_sessions add column if not exists last_reconciled_at timestamptz;

create or replace function private.dispatch_scheduled_task(task_name text)
returns bigint language plpgsql security invoker set search_path='' as $$
declare
  api_url text;
  service_secret text;
begin
  if task_name not in ('calls','reconcile','recaps') then
    raise exception 'Unsupported scheduler task';
  end if;
  select decrypted_secret into api_url from vault.decrypted_secrets where name='nila_scheduler_api_url';
  select decrypted_secret into service_secret from vault.decrypted_secrets where name='nila_scheduler_service_secret';
  if api_url is null or api_url !~ '^https://[^/]+$' or length(service_secret)<32 or service_secret is null then
    raise exception 'Nila scheduler Vault settings are missing';
  end if;
  return net.http_post(
    url:=api_url||'/internal/scheduler/'||task_name,
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_secret),
    body:='{}'::jsonb,
    timeout_milliseconds:=120000
  );
end;
$$;
revoke all on function private.dispatch_scheduled_task(text) from public,anon,authenticated,service_role;

create or replace function private.purge_expired_scheduler_data()
returns void language plpgsql security invoker set search_path='' as $$
begin
  delete from private.call_transcripts where expires_at<now();
  delete from public.audit_logs where created_at<now()-interval '90 days';
  delete from cron.job_run_details where end_time<now()-interval '7 days'
    and jobid in (select jobid from cron.job where jobname in ('nila-calls','nila-reconcile','nila-recaps','nila-retention'));
end;
$$;
revoke all on function private.purge_expired_scheduler_data() from public,anon,authenticated,service_role;

select cron.schedule('nila-calls','* * * * *', $$select private.dispatch_scheduled_task('calls')$$);
select cron.schedule('nila-reconcile','*/5 * * * *', $$select private.dispatch_scheduled_task('reconcile')$$);
select cron.schedule('nila-recaps','5 * * * *', $$select private.dispatch_scheduled_task('recaps')$$);
select cron.schedule('nila-retention','17 * * * *', $$select private.purge_expired_scheduler_data()$$);

do $$
declare scheduler_job record;
begin
  for scheduler_job in select jobid from cron.job where jobname in ('nila-calls','nila-reconcile','nila-recaps','nila-retention') loop
    perform cron.alter_job(scheduler_job.jobid,active:=false);
  end loop;
end;
$$;
