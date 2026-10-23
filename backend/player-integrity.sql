-- Player names are unique within the signed-in club workspace, including archived players.
-- Keep the existing atomic workspace save and owner RLS policies.
create or replace function public.td_validate_players()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  players jsonb := new.state->'players';
  old_players jsonb := '[]'::jsonb;
  numbered_players jsonb := '[]'::jsonb;
  player_record jsonb;
  prior_player jsonb;
  highest_number bigint;
begin
  if tg_op='UPDATE' then old_players:=old.state->'players'; end if;
  if exists (
    select 1 from jsonb_array_elements(players) p
    where p ? 'playerNumber' and p->'playerNumber'<>'null'::jsonb and (
      jsonb_typeof(p->'playerNumber')<>'number'
      or not (p->>'playerNumber' ~ '^[1-9][0-9]*$')
      or case when p->>'playerNumber' ~ '^[1-9][0-9]*$' then (p->>'playerNumber')::numeric>9007199254740991 else false end
    )
  ) then raise exception 'Player numbers must be positive whole numbers.' using errcode='23514'; end if;
  select coalesce(max(case when p->>'playerNumber' ~ '^[1-9][0-9]*$' then (p->>'playerNumber')::bigint else 0 end),0)
  into highest_number from jsonb_array_elements(players||old_players) p;
  for player_record in select value from jsonb_array_elements(players) loop
    select value into prior_player from jsonb_array_elements(old_players) p where p->>'id'=player_record->>'id';
    if prior_player->>'playerNumber' is not null then
      if player_record->>'playerNumber' is not null and player_record->'playerNumber'<>prior_player->'playerNumber'
      then raise exception 'Player numbers are permanent.' using errcode='23514'; end if;
      player_record:=jsonb_set(player_record,'{playerNumber}',prior_player->'playerNumber');
    elsif player_record->>'playerNumber' is null then
      highest_number:=highest_number+1;
      if highest_number>9007199254740991 then raise exception 'Player number limit reached.' using errcode='23514'; end if;
      player_record:=jsonb_set(player_record,'{playerNumber}',to_jsonb(highest_number));
    end if;
    numbered_players:=numbered_players||jsonb_build_array(player_record);
  end loop;
  players:=numbered_players;
  new.state:=jsonb_set(new.state,'{players}',players);
  if exists(select 1 from jsonb_array_elements(players) p group by p->>'playerNumber' having count(*)>1)
  then raise exception 'That player number already exists.' using errcode='23505'; end if;
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

-- Backfill existing cloud records once. The version bump protects open older clients.
update public.td_workspaces set state=state,version=version+1,updated_at=clock_timestamp()
where exists(select 1 from jsonb_array_elements(state->'players') p where p->>'playerNumber' is null);
