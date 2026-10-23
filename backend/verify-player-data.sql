-- Exercise the installed trigger without creating accounts or retaining test rows.
begin;
create temporary table td_player_validation_test (state jsonb not null);
create trigger td_player_validation_test before insert or update of state on td_player_validation_test
for each row execute function public.td_validate_players();
do $$
declare
  doc jsonb := '{"schemaVersion":1,"players":[{"id":"player-1","name":"Alex Smith","phone":"555-0100"}],"templates":[],"tournaments":[]}'::jsonb;
  candidate jsonb;
  bad_number jsonb;
begin
  insert into td_player_validation_test values(doc);
  assert (select state#>>'{players,0,playerNumber}' from td_player_validation_test)='1','First player number was not 001';
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
  -- Legacy clients may omit numbers; the trigger restores permanent assignments.
  update td_player_validation_test set state=jsonb_set(state,'{players,0}',(state#>'{players,0}')-'playerNumber');
  assert (select state#>>'{players,0,playerNumber}' from td_player_validation_test)='1','Omitted number was not restored';
  begin
    update td_player_validation_test set state=jsonb_set(state,'{players,0,playerNumber}','9'::jsonb);
    raise exception 'Renumbering a player unexpectedly allowed';
  exception when check_violation then null; end;
  foreach bad_number in array array['0'::jsonb,'-1'::jsonb,'1.5'::jsonb,'"002"'::jsonb,'9007199254740992'::jsonb] loop
    begin
      update td_player_validation_test set state=jsonb_set(state,'{players,0,playerNumber}',bad_number);
      raise exception 'Invalid player number unexpectedly allowed';
    exception when check_violation then null; end;
  end loop;
  update td_player_validation_test set state=jsonb_set(state,'{players}',(state->'players')||'[{"id":"player-2","name":"Beta"}]'::jsonb);
  assert (select state#>>'{players,1,playerNumber}' from td_player_validation_test)='2','Second player number was not 002';
  update td_player_validation_test set state=jsonb_set(state,'{players,1,archived}','true'::jsonb);
  update td_player_validation_test set state=jsonb_set(state,'{players}',(state->'players')||'[{"id":"player-3","name":"Gamma"}]'::jsonb);
  assert (select state#>>'{players,2,playerNumber}' from td_player_validation_test)='3','Archived number was reused';
  begin
    update td_player_validation_test set state=jsonb_set(state,'{players}',(state->'players')||'[{"id":"player-4","name":"Delta","playerNumber":2}]'::jsonb);
    raise exception 'Duplicate player number unexpectedly allowed';
  exception when unique_violation then null; end;
  update td_player_validation_test set state=jsonb_set(state,'{tournaments}','[{"entries":[{"id":"entry-1","playerId":"player-1"}]}]'::jsonb);
  update td_player_validation_test set state=jsonb_set(state,'{players}',jsonb_build_array(state#>'{players,2}',state#>'{players,0}',state#>'{players,1}'));
  assert (select state#>>'{players,1,playerNumber}' from td_player_validation_test)='1','Reordering changed number';
  assert (select state#>>'{tournaments,0,entries,0,playerId}' from td_player_validation_test)='player-1','History reference changed';
end $$;
rollback;
select 'PASS: installed player trigger rejects duplicate names/IDs, blanks, missing references and ID deletion; sequential numbers remain unique and permanent through renames, archival, reordering and legacy saves; history references and phone are retained. No test rows retained.' as verification;
