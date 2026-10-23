-- Validate phone formatting against the installed trigger without retaining test rows.
begin;
create temporary table td_phone_validation_test (state jsonb not null);
create trigger td_phone_validation_test before insert or update of state on td_phone_validation_test
for each row execute function public.td_validate_players();
do $$
declare
  bad_phone jsonb;
begin
  insert into td_phone_validation_test values('{"schemaVersion":1,"players":[{"id":"phone-fixture","name":"Phone fixture","phone":"4045550123"}],"templates":[],"tournaments":[{"entries":[{"playerId":"phone-fixture"}]}]}'::jsonb);
  assert (select state#>>'{players,0,phone}' from td_phone_validation_test)='404-555-0123','Raw digits were not formatted';
  update td_phone_validation_test set state=jsonb_set(state,'{players,0,phone}','"770-555-0199"'::jsonb);
  assert (select state#>>'{players,0,phone}' from td_phone_validation_test)='770-555-0199','Formatted phone changed';
  foreach bad_phone in array array['"123456789"'::jsonb,'"12345678901"'::jsonb,'"abc5550123"'::jsonb,'"+14045550123"'::jsonb,'"(404)5550123"'::jsonb,'"404.555.0123"'::jsonb,'"404 555 0123"'::jsonb,'"404-55-50123"'::jsonb,'1234567890'::jsonb,'null'::jsonb] loop
    begin
      update td_phone_validation_test set state=jsonb_set(state,'{players,0,phone}',bad_phone);
      raise exception 'Invalid phone was accepted';
    exception when check_violation then null; end;
    assert (select state#>>'{players,0,phone}' from td_phone_validation_test)='770-555-0199','Invalid save changed the phone';
  end loop;
  update td_phone_validation_test set state=jsonb_set(state,'{players,0,phone}','""'::jsonb);
  assert (select state#>>'{players,0,phone}' from td_phone_validation_test)='','Optional blank rejected';
  assert (select state#>>'{players,0,playerNumber}' from td_phone_validation_test)='1','Player number changed';
  assert (select state#>>'{tournaments,0,entries,0,playerId}' from td_phone_validation_test)='phone-fixture','Entry reference changed';
end $$;
rollback;
select 'PASS: ten-digit phones normalize; formatted and blank values remain valid; malformed numbers, wrong lengths and non-string data are rejected; identity is preserved. No test rows retained.' as verification;
