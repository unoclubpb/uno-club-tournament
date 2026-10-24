-- Verify display mode storage without changing production tournaments.
begin;
create temporary table td_tv_display_validation (state jsonb not null);
create trigger td_tv_display_validation before insert or update of state on td_tv_display_validation
for each row execute function public.td_validate_players();
insert into td_tv_display_validation values ('{"schemaVersion":1,"players":[],"templates":[],"tournaments":[{"id":"tv-validation","entries":[],"tvDisplayMode":"clock-seating","clock":{"index":0,"status":"running","remainingMs":900000,"deadline":1792883700000}}]}'::jsonb);
do $$
declare original_clock jsonb;
begin
 select state#>'{tournaments,0,clock}' into original_clock from td_tv_display_validation;
 assert (select state#>>'{tournaments,0,tvDisplayMode}' from td_tv_display_validation)='clock-seating','Seating mode was not retained';
 update td_tv_display_validation set state=jsonb_set(state,'{tournaments,0,tvDisplayMode}','"full-clock"'::jsonb);
 assert (select state#>>'{tournaments,0,tvDisplayMode}' from td_tv_display_validation)='full-clock','Full clock mode was not retained';
 assert (select state#>'{tournaments,0,clock}' from td_tv_display_validation)=original_clock,'Changing display mode altered the clock';
end $$;
select 'PASS: TV modes survive storage validation without changing the clock' as result;
rollback;
