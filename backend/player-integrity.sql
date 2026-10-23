-- Player names are unique within the signed-in club workspace, including archived players.
-- Keep the existing atomic workspace save and owner RLS policies.
create or replace function public.td_validate_players()
returns trigger language plpgsql security invoker set search_path='' as $$
declare players jsonb := new.state->'players';
begin
  if exists (
    select 1 from jsonb_array_elements(players) p
    where jsonb_typeof(p->'name') is distinct from 'string'
       or length(btrim(regexp_replace(replace(p->>'name',chr(160),' '),'[[:space:]]+',' ','g'))) not between 1 and 100
       or jsonb_typeof(p->'id') is distinct from 'string' or coalesce(p->>'id','')=''
       or (p ? 'phone' and (jsonb_typeof(p->'phone') is distinct from 'string' or length(p->>'phone')>40))
  ) then raise exception 'Invalid player name, ID, or phone number.' using errcode='23514'; end if;
  if exists (
    select 1 from jsonb_array_elements(players) p
    group by lower(btrim(regexp_replace(replace(p->>'name',chr(160),' '),'[[:space:]]+',' ','g')))
    having count(*)>1
  ) then raise exception 'That name already exists. Please choose a different name.' using errcode='23505'; end if;
  if exists (select 1 from jsonb_array_elements(players) p group by p->>'id' having count(*)>1)
  then raise exception 'Player IDs must be unique.' using errcode='23505'; end if;
  if tg_op='UPDATE' then
    if exists (select 1 from jsonb_array_elements(old.state->'players') p where not exists (
      select 1 from jsonb_array_elements(players) n where n->>'id'=p->>'id'
    )) then raise exception 'Player IDs are permanent. Archive the player instead of removing their record.' using errcode='23514'; end if;
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.state->'tournaments') t
    cross join lateral jsonb_array_elements(t->'entries') e
    where not exists (select 1 from jsonb_array_elements(players) p where p->>'id'=e->>'playerId')
  ) then raise exception 'Tournament entries must reference an existing player ID.' using errcode='23503'; end if;
  return new;
end $$;
revoke all on function public.td_validate_players() from public,anon,authenticated;
drop trigger if exists td_player_integrity on public.td_workspaces;
create trigger td_player_integrity before insert or update of state on public.td_workspaces
for each row execute function public.td_validate_players();
