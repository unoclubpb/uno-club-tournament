-- Tournament Director v0.1.0. Separate from the other Uno Club apps.
-- Document storage keeps each multi-field tournament operation atomic in this base version.
create table public.td_workspaces (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  version bigint not null default 1 check(version>0),
  state jsonb not null check(jsonb_typeof(state)='object' and state ? 'schemaVersion' and state->>'schemaVersion'='1' and jsonb_typeof(state->'players')='array' and jsonb_typeof(state->'templates')='array' and jsonb_typeof(state->'tournaments')='array' and octet_length(state::text)<2000000),
  updated_at timestamptz not null default now()
);
alter table public.td_workspaces enable row level security;
revoke all on public.td_workspaces from anon,authenticated;
grant select,insert,update on public.td_workspaces to authenticated;
create policy owner_read on public.td_workspaces for select to authenticated using((select auth.uid())=owner_id);
create policy owner_insert on public.td_workspaces for insert to authenticated with check((select auth.uid())=owner_id);
create policy owner_update on public.td_workspaces for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create function public.td_save_workspace(p_expected_version bigint,p_state jsonb)
returns public.td_workspaces language plpgsql security invoker set search_path='' as $$
declare r public.td_workspaces;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_expected_version is null or p_expected_version<0 then raise exception 'Invalid version'; end if;
  if p_expected_version=0 then
    insert into public.td_workspaces(owner_id,state) values(auth.uid(),p_state)
    on conflict(owner_id) do nothing returning * into r;
  else
    update public.td_workspaces set state=p_state,version=version+1,updated_at=clock_timestamp()
    where owner_id=auth.uid() and version=p_expected_version returning * into r;
  end if;
  if r.owner_id is null then raise exception 'TD_CONFLICT: tournament changed on another device'; end if;
  return r;
end $$;
create function public.td_server_time() returns timestamptz language sql volatile security invoker set search_path='' as $$select clock_timestamp()$$;
revoke all on function public.td_save_workspace(bigint,jsonb) from public,anon;
revoke all on function public.td_server_time() from public,anon;
grant execute on function public.td_save_workspace(bigint,jsonb),public.td_server_time() to authenticated;
alter publication supabase_realtime add table public.td_workspaces;
