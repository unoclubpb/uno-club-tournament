-- Transactional tests: all test users and data are rolled back.
begin;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare doc jsonb := '{"schemaVersion":1,"players":[],"templates":[],"tournaments":[]}'::jsonb; r public.td_workspaces;
begin
  select * into r from public.td_save_workspace(0,doc);
  assert r.version=1,'Initial save failed';
  select * into r from public.td_save_workspace(1,doc);
  assert r.version=2,'Revision update failed';
  begin
    perform public.td_save_workspace(1,doc);
    raise exception 'Stale write unexpectedly allowed';
  exception when raise_exception then
    if sqlerrm not like 'TD_CONFLICT:%' then raise; end if;
  end;
  begin
    update public.td_workspaces set owner_id='10000000-0000-4000-8000-000000000002';
    raise exception 'Owner reassignment unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$
declare touched integer;
begin
  assert (select count(*) from public.td_workspaces)=0,'Other user can read workspace';
  update public.td_workspaces set version=99;
  get diagnostics touched = row_count;
  assert touched=0,'Other user can update workspace';
  begin
    insert into public.td_workspaces(owner_id,state) values('10000000-0000-4000-8000-000000000001','{"schemaVersion":1,"players":[],"templates":[],"tournaments":[]}');
    raise exception 'Forged ownership unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
set local role anon;
do $$
begin
  begin
    perform * from public.td_workspaces;
    raise exception 'Anonymous read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.td_save_workspace(0,'{"schemaVersion":1,"players":[],"templates":[],"tournaments":[]}');
    raise exception 'Anonymous write unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'PASS: hosted Supabase save, stale-write protection, owner isolation and anonymous denial; test data rolled back.' as verification;
