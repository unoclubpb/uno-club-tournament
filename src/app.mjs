om Payouts':settings.payoutMode==='guaranteed'?'the automatic guarantee':'automatic payouts'}? ${prizes({...t,settings}).map((n,i)=>placeName(i)+': '+money(n)).join('; ')}`))return;
    if(await commit({type:'payout-settings',tournamentId:selected,settings,custom})){toast('Payouts updated.');}return;
  }
  if(form.id==='rebuy-count-form'){if(Number(fd.get('version'))!==version)throw new Error('Tournament changed. Reopen the rebuy total before saving.');const raw=String(fd.get('count')).trim();if(!/^\d+$/.test(raw))throw new Error('Enter a whole number of rebuys, zero or greater.');let overrideCutoff=fd.get('overrideCutoff')==='true';const t=state.tournaments.find(t=>t.id===fd.get('tournamentId'));if(!overrideCutoff&&!canRecordRebuys(t,clockAt(t,timeNow()))){if(!await confirmApp('Rebuys are closed. Override and change the rebuy total?','Rebuys Closed','Override'))return;overrideCutoff=true;}if(await commit({type:'rebuy-count',tournamentId:fd.get('tournamentId'),count:Number(raw),overrideCutoff})){dlg.close();toast('Tournament rebuy total saved.');}return;}
  if(form.id==='payment-form'){if(await commit({type:'payment',tournamentId:selected,entryId:fd.get('entryId'),kind:'addon'})){dlg.close();toast('Add-on recorded.');}return;}
  if(form.id==='seat-form'){
    const source={entryId:fd.get('entryId'),tournamentId:fd.get('tournamentId'),version:Number(fd.get('version')),fromTable:fd.get('fromTable')===''?null:Number(fd.get('fromTable')),fromSeat:fd.get('fromSeat')===''?null:Number(fd.get('fromSeat'))};checkSeatSource(source);
    const value=fd.get('seat');if(value==='unseated'){if(await commit({type:'seat',tournamentId:source.tournamentId,entryId:source.entryId,table:null,seat:null})){dlg.close();toast('Player is now unseated.');}}
    else{const [table,seat]=value.split('/').map(Number);await requestSeatMove(source,table,seat);}return;
  }
}catch(e){toast(e.message,true);}});
window.addEventListener('popstate',()=>{const params=new URLSearchParams(location.search);view=params.get('view')||'home';historyTournamentId=view==='history-summary'?params.get('tournament')||'':'';historyReturnPlayer=params.get('player')||historyReturnPlayer;if(view==='players'&&params.get('player')){playerDetail=params.get('player');profilePanel='history';profileHistoryMode='tournaments';}remotePanel=new URLSearchParams(location.search).get('panel')||'clock';editor=null;render();});
window.addEventListener('online',()=>refresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden){synchronizeTimeIfSignedIn();refresh();tick();}});
function synchronizeTimeIfSignedIn(){if(session)synchronizeTime();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session){void synchronizeTime();void refresh();}});window.addEventListener('online',()=>{if(session){void synchronizeTime();void refresh();}});
setInterval(()=>refresh(),2500);setInterval(synchronizeTimeIfSignedIn,60000);
void tvWindow.prime();
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===window.opener&&event.data?.type==='uno-tv-fullscreen'&&view==='clock')void tryTvFullscreen(false);});
window.addEventListener('resize',refreshSavedLayoutPreviews);
window.addEventListener('resize',()=>fitTvSeating());
document.addEventListener('fullscreenchange',()=>fitTvSeating());
clockToolbar=installClockToolbar();
seatDragging=installSeatDragging({getScrollBounds:()=>({top:Math.min(innerHeight,Math.max(0,$('.management-chrome')?.getBoundingClientRect().bottom||$('.remote-header')?.getBoundingClientRect().bottom||0)),bottom:innerHeight}),getSource:entryId=>view!=='manage'||!movePlayersEnabled||dlg.open?null:seatSource(entryId),getLabel:source=>`Seat ${source.fromSeat} · ${pName(current().entries.find(e=>e.id===source.entryId))}`,onStart:clearSeatPick,onDrop:(source,target)=>requestSeatMove(source,target.table,target.seat),onError:error=>toast(error.message,true)});
document.addEventListener('keydown',event=>{
  const button=event.target.closest?.('.management-sidebar [data-tab]');if(!button)return;
  const tabs=[...document.querySelectorAll('.management-sidebar [data-tab]')],index=tabs.indexOf(button);
  const next=event.key==='ArrowDown'?(index+1)%tabs.length:event.key==='ArrowUp'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
  if(next!==null){event.preventDefault();tabs[next].click();}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')clearSeatPick();});
render();
let authEventSeen=false;
db.auth.onAuthStateChange((event,newSession)=>{authEventSeen=true;setTimeout(()=>{if(event==='TOKEN_REFRESHED'){session=newSession;void refresh();}else void acceptSession(newSession);},0);});
db.auth.getSession().then(({data,error})=>{if(authEventSeen)return;if(error){authReady=true;authError='Could not restore your sign-in. Please sign in again.';render();return;}void acceptSession(data.session);}).catch(()=>{authReady=true;authError='Could not connect to sign-in. Please try again.';render();});

document.addEventListener('change',async event=>{
 const select=event.target;if(!select.matches?.('#structure-form [data-layout-selector]'))return;
 const form=select.form,rows=[...form.querySelectorAll('[data-level]')],index=rows.indexOf(select.closest('[data-level]')),following=rows.slice(index+1),ed=editor,versionAtPrompt=version,chosen=select.value;
 if(index<0||!following.length)return;
 const label=select.selectedOptions[0]?.textContent||'this layout';
 if(!await confirmApp(`Use ${label} for all subsequent levels and breaks? Choose Cancel to change only this level.`,'Apply Clock Layout','Apply to All Subsequent'))return;
 if(editor!==ed||version!==versionAtPrompt||!select.isConnected||select.value!==chosen)return;
 for(const row of following){const next=row.querySelector('[data-layout-selector]');if(next)next.value=chosen;}
});

document.addEventListener('click',event=>{if(!event.target.closest?.('[data-action="save-as-structure"]'))return;try{
 const form=document.querySelector('#structure-form');if(!editor?.event||!form||!form.reportValidity())return;captureEditor();editor.structureExportDraft=clone(editor.value);
 modal('Save as New Structure',`<form id="tournament-structure-copy-form"><input type="hidden" name="version" value="${version}"><label>New structure name<input name="name" required maxlength="120" value="${esc((current().templateName||'Tournament')+' — Copy')}"></label><p class="muted">Saves the setup only. Your original structure and current tournament remain unchanged.</p><button class="button primary full">Save New Structure</button></form>`);
 }catch(error){toast(error.message,true);}});
document.addEventListener('submit',async event=>{if(event.target.id!=='tournament-structure-copy-form')return;event.preventDefault();try{
 const form=event.target;if(!form.reportValidity())return;const draft=editor?.structureExportDraft;if(!draft||Number(form.elements.version.value)!==version||editor.version!==version)throw new Error('Tournament changed. Close this dialog and review the settings before trying again.');
 if(await commit({type:'tournament-save-structure',tournamentId:current().id,id:id(),name:form.elements.name.value,settings:draft.settings,levels:draft.levels})){editor.version=version;delete editor.structureExportDraft;dlg.close();toast('New structure saved. Tournament settings remain unsaved until Save Tournament Settings.');}
 }catch(error){toast(error.message,true);}});

// Reveal the amount field for the selected settlement fee type without discarding either value.
document.addEventListener('change',event=>{if(event.target.name!=='houseFeeMode')return;const form=event.target.form,flat=event.target.value==='flat';form.querySelector('[data-fee-percent]').hidden=flat;form.querySelector('[data-fee-flat]').hidden=!flat;});
