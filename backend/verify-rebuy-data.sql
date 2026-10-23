-- Exercise the installed player trigger with tournament-level rebuy totals.
-- Temporary rows only: this does not alter the organizer's workspace.
begin;
create temporary table td_rebuy_validation_test (state jsonb not null);
create trigger td_rebuy_validation_test before insert or update of state on td_rebuy_validation_test
for each row execute function public.td_validate_players();
do $$
declare total integer;
begin
  insert into td_rebuy_validation_test values (
    '{"schemaVersion":1,"players":[{"id":"fixture-player","name":"Rebuy fixture","playerNumber":1}],"templates":[],"tournaments":[{"id":"fixture-tournament","rebuyCount":0,"entries":[{"id":"fixture-entry","playerId":"fixture-player","payments":[{"kind":"entry","total":5000,"dealerToke":1000,"chips":5000,"paid":true}]}]}]}'::jsonb
  );
  foreach total in array array[3,5,2,0] loop
    update td_rebuy_validation_test set state=jsonb_set(state,'{tournaments,0,rebuyCount}',to_jsonb(total));
    assert (select (state#>>'{tournaments,0,rebuyCount}')::integer from td_rebuy_validation_test)=total,'Rebuy total was not replaced';
    assert (select jsonb_array_length(state#>'{tournaments,0,entries,0,payments}') from td_rebuy_validation_test)=1,'Per-player payment changed';
    assert (select state#>>'{tournaments,0,entries,0,playerId}' from td_rebuy_validation_test)='fixture-player','Entry reference changed';
    assert (select state#>>'{players,0,playerNumber}' from td_rebuy_validation_test)='1','Player number changed';
  end loop;
end $$;
rollback;
select 'PASS: tournament rebuy totals can be replaced and reset while the installed player-integrity trigger retains player identity and entry references; no production rows changed.' as verification;
