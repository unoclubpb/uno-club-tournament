-- Shared-document remote eliminations. No tournament/player copies or elevated client access.
create schema if not exists td_internal;
revoke all on schema td_internal from public,anon;
grant usage on schema td_internal to authenticated;

create or replace function td_internal.finalize_remote(p_state jsonb,p_now bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s jsonb:=p_state; t jsonb; e jsonb; item record; ti int; ei int; active_count int; next_order int; request_id text; requests jsonb;
begin
  for item in
    select (a.ordinality-1)::int tidx,(b.ordinality-1)::int eidx,b.value->'pendingElimination' pending
    from jsonb_array_elements(s->'tournaments') with ordinality a
    cross join lateral jsonb_array_elements(a.value->'entries') with ordinality b
    where a.value->>'status'<>'completed' and b.value->'pendingElimination' is not null
      and (b.value#>>'{pendingElimination,expiresAt}')::bigint<=p_now
    order by (b.value#>>'{pendingElimination,expiresAt}')::bigint,b.value#>>'{pendingElimination,id}'
  loop
    ti:=item.tidx; ei:=item.eidx;t:=s#>array['tournaments',ti::text];e:=t#>array['entries',ei::text];
    if e->>'eliminatedAt' is not null or e->'pendingElimination' is null then continue; end if;
    select count(*) into active_count from jsonb_array_elements(t->'entries') v where v->>'eliminatedAt' is null;
    if active_count<=1 then raise exception 'Pending eliminations must leave a winner'; end if;
    select coalesce(max((v->>'eliminationOrder')::int),0)+1 into next_order from jsonb_array_elements(t->'entries') v;
    request_id:=e#>>'{pendingElimination,id}';
    e:=(e-'pendingElimination')||jsonb_build_object('eliminatedAt',(item.pending->>'expiresAt')::bigint,'place',active_count,'eliminationOrder',next_order,
      'eliminationSeat',jsonb_build_object('table',e->'table','seat',e->'seat','seatLocked',coalesce((e->>'seatLocked')::boolean,false)),
      'table',null,'seat',null,'seatLocked',false);
    t:=jsonb_set(t,array['entries',ei::text],e);
    t:=jsonb_set(t,'{eliminationUndo}',coalesce(t->'eliminationUndo','[]'::jsonb)||jsonb_build_array(jsonb_build_object('entryId',e->'id')||(e->'eliminationSeat')));
    select coalesce(jsonb_agg(case when q->>'id'=request_id then q||jsonb_build_object('status','finalized','closedAt',(item.pending->>'expiresAt')::bigint) else q end),'[]'::jsonb)
      into requests from jsonb_array_elements(coalesce(t->'remoteEliminationRequests','[]'::jsonb)) q;
    t:=jsonb_set(t,'{remoteEliminationRequests}',requests);s:=jsonb_set(s,array['tournaments',ti::text],t);
  end loop;
  return s;
end $$;
revoke all on function td_internal.finalize_remote(jsonb,bigint) from public,anon;
grant execute on function td_internal.finalize_remote(jsonb,bigint) to authenticated;

create or replace function public.td_remote_elimination(p_tournament_id text,p_entry_id text,p_request_id uuid,p_command text)
returns public.td_workspaces language plpgsql security invoker set search_path='' as $$
declare r public.td_workspaces; s jsonb; t jsonb; e jsonb; ti int; ei int; ms bigint; pending jsonb; requests jsonb; prior jsonb; available int;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_request_id is null or p_command is null or p_command not in ('start','undo') then raise exception 'Invalid remote command'; end if;
  select * into r from public.td_workspaces where owner_id=auth.uid() for update;
  if r.owner_id is null then raise exception 'Load your tournament account first'; end if;
  ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;s:=td_internal.finalize_remote(r.state,ms);
  select (ordinality-1)::int,value into ti,t from jsonb_array_elements(s->'tournaments') with ordinality where value->>'id'=p_tournament_id;
  if t is null or t->>'status'='completed' then raise exception 'Choose an active tournament'; end if;
  select (ordinality-1)::int,value into ei,e from jsonb_array_elements(t->'entries') with ordinality where value->>'id'=p_entry_id;
  if e is null then raise exception 'Player entry not found'; end if;
  requests:=coalesce(t->'remoteEliminationRequests','[]'::jsonb);
  select q into prior from jsonb_array_elements(requests) q where q->>'id'=p_request_id::text;
  if prior is not null and prior->>'entryId'<>p_entry_id then raise exception 'Remote request belongs to another player'; end if;
  if p_command='start' and prior is null then
    if e->>'eliminatedAt' is not null then raise exception 'Player already eliminated'; end if;
    if e->'pendingElimination' is null then
      select count(*) into available from jsonb_array_elements(t->'entries') v where v->>'eliminatedAt' is null and v->'pendingElimination' is null;
      if available<=1 then raise exception 'Leave one player active to confirm the winner'; end if;
      pending:=jsonb_build_object('id',p_request_id,'requestedAt',ms,'expiresAt',ms+5000);
      e:=jsonb_set(e,'{pendingElimination}',pending);
      requests:=requests||jsonb_build_array(pending||jsonb_build_object('entryId',p_entry_id,'status','pending'));
    end if;
  elsif p_command='undo' and e#>>'{pendingElimination,id}'=p_request_id::text and ms<(e#>>'{pendingElimination,expiresAt}')::bigint then
    e:=e-'pendingElimination';
    select jsonb_agg(case when q->>'id'=p_request_id::text then q||jsonb_build_object('status','canceled','closedAt',ms) else q end)
      into requests from jsonb_array_elements(requests) q;
  end if;
  t:=jsonb_set(jsonb_set(t,array['entries',ei::text],e),'{remoteEliminationRequests}',requests);
  s:=jsonb_set(s,array['tournaments',ti::text],t);
  if s is distinct from r.state then
    -- Transaction-local marker is set only by server RPC/worker code, never by document saves.
    perform set_config('td.remote_write','on',true);
    update public.td_workspaces set state=s,version=version+1,updated_at=clock_timestamp() where owner_id=auth.uid() returning * into r;
    perform set_config('td.remote_write','off',true);
  end if;
  return r;
end $$;
revoke all on function public.td_remote_elimination(text,text,uuid,text) from public,anon;
grant execute on function public.td_remote_elimination(text,text,uuid,text) to authenticated;

create or replace function td_internal.guard_remote()
returns trigger language plpgsql security invoker set search_path='' as $$
declare t jsonb; old_t jsonb; e jsonb; old_e jsonb; pending_count int;
begin
  if current_setting('td.remote_write',true)='on' then return new; end if;
  for t in select value from jsonb_array_elements(new.state->'tournaments') loop
    old_t:=null;
    if tg_op='UPDATE' then select value into old_t from jsonb_array_elements(old.state->'tournaments') where value->>'id'=t->>'id'; end if;
    if coalesce(t->'remoteEliminationRequests','[]'::jsonb) is distinct from coalesce(old_t->'remoteEliminationRequests','[]'::jsonb) then raise exception 'Remote elimination records are managed by the server'; end if;
    for e in select value from jsonb_array_elements(t->'entries') loop
      select value into old_e from jsonb_array_elements(coalesce(old_t->'entries','[]'::jsonb)) where value->>'id'=e->>'id';
      if e->'pendingElimination' is distinct from old_e->'pendingElimination' then raise exception 'Pending eliminations are managed by the server'; end if;
    end loop;
  end loop;
  if tg_op='UPDATE' then
    for old_t in select value from jsonb_array_elements(old.state->'tournaments') loop
      select value into t from jsonb_array_elements(new.state->'tournaments') where value->>'id'=old_t->>'id';
      pending_count:=0;
      for old_e in select value from jsonb_array_elements(old_t->'entries') where value->'pendingElimination' is not null loop
        pending_count:=pending_count+1;
        if (old_e#>>'{pendingElimination,expiresAt}')::bigint<=floor(extract(epoch from clock_timestamp())*1000)::bigint then raise exception 'TD_CONFLICT: A remote elimination is finalizing. Refresh and retry'; end if;
        select value into e from jsonb_array_elements(coalesce(t->'entries','[]'::jsonb)) where value->>'id'=old_e->>'id';
        if e is distinct from old_e or t->>'status'='completed' then raise exception 'Pending elimination: that player and seat are reserved until Undo expires'; end if;
        if old_e->>'table' is not null and exists(select 1 from jsonb_array_elements(t->'entries') v where v->>'id'<>old_e->>'id' and v->>'eliminatedAt' is null and v->'table'=old_e->'table' and v->'seat'=old_e->'seat') then raise exception 'That seat is reserved for a pending elimination'; end if;
      end loop;
      if pending_count>0 and (select count(*) from jsonb_array_elements(t->'entries') v where v->>'eliminatedAt' is null)<=pending_count then raise exception 'Pending eliminations must leave a winner'; end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function td_internal.guard_remote() from public,anon,authenticated;
drop trigger if exists td_remote_integrity on public.td_workspaces;
create trigger td_remote_integrity before insert or update of state on public.td_workspaces for each row execute function td_internal.guard_remote();

create or replace function td_internal.finalize_remote_eliminations()
returns integer language plpgsql security invoker set search_path='' as $$
declare r record; s jsonb; changed int:=0;
begin
  for r in select owner_id,state from public.td_workspaces
    where state @? '$.tournaments[*].entries[*].pendingElimination' for update skip locked loop
    s:=td_internal.finalize_remote(r.state,floor(extract(epoch from clock_timestamp())*1000)::bigint);
    if s is distinct from r.state then
      perform set_config('td.remote_write','on',true);
      update public.td_workspaces set state=s,version=version+1,updated_at=clock_timestamp() where owner_id=r.owner_id;
      perform set_config('td.remote_write','off',true);changed:=changed+1;
    end if;
  end loop;
  return changed;
end $$;
revoke all on function td_internal.finalize_remote_eliminations() from public,anon,authenticated;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('td-finalize-remote-eliminations','1 second','select td_internal.finalize_remote_eliminations()');
select cron.schedule('td-remote-job-log-retention','12 4 * * *', $job$delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname in ('td-finalize-remote-eliminations','td-remote-job-log-retention')) and end_time < now()-interval '1 day'$job$);
