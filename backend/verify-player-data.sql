-- Exercise the installed trigger without creating accounts or retaining test rows.
begin;
create temporary table td_player_validation_test (state jsonb not null);
create trigger td_player_validation_test before insert or update of state on td_player_validation_test
for each row execute function public.td_validate_players();
do $$
declare
  doc jsonb := '{"schemaVersion":1,"players":[{"id":"player-1","name":"Alex Smith","phone":"555-0100"}],"templates":[],"tournaments":[]}'::jsonb;
  candidate jsonb;
begin
  insert into td_player_validation_test values(doc);
  candidate=jsonb_set(doc,'{players}',(doc->'players')||'[{"id":"player-2","name":"  aLEX   SMITH "}]'::jsonb);
  begin
    insert into td_player_validation_test values(candidate);
    raise exception 'Duplicate player name unexpectedly allowed';
  exception when unique_violation then null; end;
  update td_player_validation_test set state=jsonb_set(state,'{players,0,name}','"Alex S"'::jsonb);
  assert (select state#>>'{players,0,id}' from td_player_validation_test)='player-1','Rename changed player identity';
  assert (select state#>>'{players,0,phone}' from td_player_validation_test)='555-0100','Phone number was lost';
  begin
    update td_player_validation_test set state=jsonb_set(state,'{players}','[]'::jsonb);
    raise exception 'Removing permanent player ID unexpectedly allowed';
  exception when check_violation then null; end;
  begin
    update td_player_validation_test set state=jsonb_set(state,'{tournaments}','[{"entries":[{"id":"entry-1","playerId":"missing-player"}]}]'::jsonb);
    raise exception 'Unknown player reference unexpectedly allowed';
  exception when foreign_key_violation then null; end;
  begin
    update td_player_validation_test set state=jsonb_set(state,'{players,0,name}','"   "'::jsonb);
    raise exception 'Blank player name unexpectedly allowed';
  exception when check_violation then null; end;
  begin
    insert into td_player_validation_test values(jsonb_set(doc,'{players}',(doc->'players')||'[{"id":"player-1","name":"Different Name"}]'::jsonb));
    raise exception 'Duplicate player ID unexpectedly allowed';
  exception when unique_violation then null; end;
end $$;
rollback;
select 'PASS: installed player trigger rejects duplicate names/IDs, blanks, missing references and ID deletion; rename retains identity and phone. No test rows retained.' as verification;
