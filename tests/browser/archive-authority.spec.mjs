import {test,expect} from '@playwright/test';
import {FIRST_CONTACT} from '../../client/afterimage-example.js';

async function openArchive(page){
  await page.route('**/archive-authority-fixture',route=>route.fulfill({contentType:'text/html',body:'<title>Archive storage fixture</title>'}));
  await page.goto('/archive-authority-fixture');
}

test('story migration preserves its legacy backup until explicit removal and rejects an older tab replacement',async({page,context})=>{
  // Question: does migration preserve its source, survive reload, and reject an older tab's replacement archive?
  // Limits: real Chromium storage with fictional stories, not physical-device quota behavior.
  await openArchive(page);
  const migrated=await page.evaluate(async packet=>{
    const {createAfterimageStore,AFTERIMAGE_STORAGE_KEY:key}=await import('/js/afterimage-store.js');
    const entry={id:'legacy-story',createdAt:'2026-11-01T00:00:00.000Z',packet,seed:'Legacy seed',tone:'wonder',source:'authored',signalIndex:0,endingIndex:0};
    const original=JSON.stringify({version:1,receptions:[entry]});
    localStorage.setItem(key,original);
    const store=createAfterimageStore(localStorage);
    const originalBeforeReady=localStorage.getItem(key);
    await store.ready;
    return {originalRetainedBeforeReady:originalBeforeReady===original,ids:store.list().map(item=>item.id),legacyRetained:localStorage.getItem(key)===original,legacyBackup:store.legacyBackup,exported:JSON.parse(store.export()).receptions.map(item=>item.id)};
  },FIRST_CONTACT);
  expect(migrated).toEqual({originalRetainedBeforeReady:true,ids:['legacy-story'],legacyRetained:true,legacyBackup:true,exported:['legacy-story']});
  await page.reload();
  const validation=await page.evaluate(async()=>{
    const {createAfterimageStore}=await import('/js/afterimage-store.js');
    window.archiveUnderTest=createAfterimageStore(localStorage);await archiveUnderTest.ready;
    window.canonicalBeforeConflict=archiveUnderTest.export();
    let invalid='';try{await archiveUnderTest.add({});}catch(error){invalid=error.message;}
    return {invalid,ids:archiveUnderTest.list().map(item=>item.id),persistent:archiveUnderTest.persistent,error:archiveUnderTest.error,legacyBackup:archiveUnderTest.legacyBackup,legacyRetained:localStorage.getItem('nox.afterimage.v1')===archiveUnderTest.exportOriginal()};
  });
  expect(validation.invalid).not.toBe('');
  expect(validation).toMatchObject({ids:['legacy-story'],persistent:true,error:'',legacyBackup:true,legacyRetained:true});
  const discarded=await page.evaluate(async()=>{
    const expected=archiveUnderTest.exportOriginal();
    const stale=await archiveUnderTest.discardLegacy(expected+'changed');
    const preserved=localStorage.getItem('nox.afterimage.v1')===expected;
    const removed=await archiveUnderTest.discardLegacy(expected);
    return {stale,preserved,removed,legacy:localStorage.getItem('nox.afterimage.v1'),legacyBackup:archiveUnderTest.legacyBackup};
  });
  expect(discarded).toEqual({stale:false,preserved:true,removed:true,legacy:null,legacyBackup:false});
  const olderTab=await context.newPage();await openArchive(olderTab);
  const changed='{"version":1,"receptions":[]}';
  await olderTab.evaluate(raw=>localStorage.setItem('nox.afterimage.v1',raw),changed);
  await expect.poll(()=>page.evaluate(()=>archiveUnderTest.error)).toContain('older NOX tabs');
  const conflict=await page.evaluate(async packet=>{
    const refreshed=await archiveUnderTest.refresh();
    let rejected='';try{await archiveUnderTest.add({packet,seed:'Refused',tone:'wonder',source:'authored'});}catch(error){rejected=error.message;}
    return {refreshed,rejected,original:archiveUnderTest.exportOriginal(),canonical:archiveUnderTest.export()===canonicalBeforeConflict};
  },FIRST_CONTACT);
  expect(conflict).toMatchObject({refreshed:false,canonical:true,original:changed});
  expect(conflict.rejected).toContain('older NOX tabs');
  const recovered=await page.evaluate(async raw=>{
    const recovered=await archiveUnderTest.resetOriginal(raw);
    return {recovered,legacy:localStorage.getItem('nox.afterimage.v1'),ids:archiveUnderTest.list().map(item=>item.id),persistent:archiveUnderTest.persistent};
  },changed);
  expect(recovered).toEqual({recovered:true,legacy:null,ids:['legacy-story'],persistent:true});
  const reopened=await context.newPage();await openArchive(reopened);
  expect(await reopened.evaluate(async()=>{
    const {createAfterimageStore}=await import('/js/afterimage-store.js');
    const store=createAfterimageStore(localStorage);await store.ready;
    return {ids:store.list().map(item=>item.id),exported:JSON.parse(store.export()).receptions.map(item=>item.id),recovery:store.recovery};
  })).toEqual({ids:['legacy-story'],exported:['legacy-story'],recovery:null});
});

test('aborting a queued story save leaves the committed archive and subscribers unchanged',async({page,context})=>{
  // Question: can cancellation before the writer lock prevent a queued story from saving?
  // Limits: deterministic lock contention in Chromium, not network cancellation or device shutdown.
  await openArchive(page);
  await page.evaluate(async()=>{
    const {createAfterimageStore}=await import('/js/afterimage-store.js');
    window.archiveUnderTest=createAfterimageStore(localStorage);await archiveUnderTest.ready;
    window.publishedStoryCounts=[];archiveUnderTest.subscribe(state=>publishedStoryCounts.push(state.receptions.length));
    await new Promise(resolve=>{
      window.archiveBlocker=navigator.locks.request('nox.afterimage.write',()=>new Promise(release=>{window.releaseArchiveLock=release;resolve();}));
    });
  });
  await page.evaluate(packet=>{
    window.storyController=new AbortController();
    window.queuedStoryResult=archiveUnderTest.add({packet,seed:'Cancelled queued story',tone:'wonder',source:'authored'},{signal:storyController.signal}).then(()=>({saved:true}),error=>({saved:false,errorName:error.name}));
  },FIRST_CONTACT);
  await expect.poll(()=>page.evaluate(async()=>{
    const state=await navigator.locks.query();return state.pending.some(lock=>lock.name==='nox.afterimage.write');
  })).toBe(true);
  const result=await page.evaluate(async()=>{
    storyController.abort();releaseArchiveLock();await archiveBlocker;
    const result=await queuedStoryResult;
    return {...result,counts:publishedStoryCounts,current:archiveUnderTest.list().length};
  });
  expect(result).toMatchObject({saved:false,errorName:'AbortError',current:0});
  expect(result.counts.every(count=>count===0)).toBe(true);
  const reopened=await context.newPage();await openArchive(reopened);
  expect(await reopened.evaluate(async()=>{
    const {createAfterimageStore}=await import('/js/afterimage-store.js');
    const store=createAfterimageStore(localStorage);await store.ready;return store.list().length;
  })).toBe(0);
});

test('a failed IndexedDB story commit never publishes or returns a successful addition',async({page})=>{
  // Question: does an aborted IndexedDB commit leave subscribers and stored stories unchanged?
  // Limits: controlled transaction failure, not hardware disk failure or every browser's quota UX.
  await openArchive(page);
  const result=await page.evaluate(async packet=>{
    const {createAfterimageStore}=await import('/js/afterimage-store.js');
    const store=createAfterimageStore(localStorage);await store.ready;
    const seen=[];store.subscribe(state=>seen.push(state.receptions.length));
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);this.transaction.abort();return request;};
    let rejected='';
    try{await store.add({packet,seed:'Aborted commit',tone:'wonder',source:'authored'});}catch(error){rejected=error.message;}
    finally{IDBObjectStore.prototype.put=put;}
    const state={rejected,seen,current:store.list().length};
    const reloaded=createAfterimageStore(localStorage);await reloaded.ready;
    return {...state,saved:reloaded.list().length};
  },FIRST_CONTACT);
  expect(result.rejected).not.toBe('');
  expect(result.seen.every(length=>length===0)).toBe(true);
  expect(result.current).toBe(0);expect(result.saved).toBe(0);
});

for(const [reason,raw] of [['invalid','{broken archive'],['unsupported','{"version":42,"receptions":[]}']])test(`canonical ${reason} story bytes remain exportable until explicit reset`,async({page})=>{
  // Question: do unreadable saved bytes remain recoverable until an explicit replacement?
  // Limits: controlled corruption, not an estimate of real-world corruption frequency.
  await openArchive(page);
  const result=await page.evaluate(async({packet,raw})=>{
    const {createAfterimageStore,AFTERIMAGE_STORAGE_KEY:key}=await import('/js/afterimage-store.js');
    const first=createAfterimageStore(localStorage);await first.ready;
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('nox.archives.v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    await new Promise((resolve,reject)=>{const transaction=db.transaction('archives','readwrite'),records=transaction.objectStore('archives'),request=records.get(key);request.onsuccess=()=>records.put({...request.result,raw,revision:4},key);transaction.oncomplete=resolve;transaction.onabort=()=>reject(transaction.error);});
    db.close();
    const store=createAfterimageStore(localStorage);await store.ready;
    const protectedState={original:store.exportOriginal(),reason:store.recovery?.reason,persistent:store.persistent};
    const visit=await store.add({packet,seed:'Preserved visit work',tone:'wonder',source:'authored'});
    const reset=await store.resetOriginal(raw);
    const restored=createAfterimageStore(localStorage);await restored.ready;
    return {protectedState,reset,visit:visit.id,ids:restored.list().map(item=>item.id),recovery:restored.recovery,persistent:restored.persistent};
  },{packet:FIRST_CONTACT,raw});
  expect(result.protectedState).toEqual({original:raw,reason,persistent:false});
  expect(result.reset).toBe(true);expect(result.ids).toEqual([result.visit]);
  expect(result.recovery).toBe(null);expect(result.persistent).toBe(true);
});

for(const kind of ['notebook','story'])test(`a live ${kind} store rejects an addition after its canonical bytes become invalid`,async({page})=>{
  // Question: does an existing store validate the current saved bytes before accepting a new write?
  // Limits: controlled IndexedDB corruption, not hardware corruption rates or model answer quality.
  await openArchive(page);
  const result=await page.evaluate(async({kind,packet})=>{
    const story=kind==='story';
    const module=await import(story?'/js/afterimage-store.js':'/js/knowledge.js');
    const key=story?module.AFTERIMAGE_STORAGE_KEY:module.KNOWLEDGE_KEY;
    const store=story?module.createAfterimageStore(localStorage):module.createKnowledge(localStorage);
    await store.ready;
    const input=story?{packet,seed:'Original saved story',tone:'wonder',source:'authored'}:{title:'Original note',text:'A violet lighthouse has seven bells.'};
    await store.add(input);
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('nox.archives.v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const broken='{"version":1,"unreadable-'+kind+'":';
    let injectedRevision;
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction('archives','readwrite'),records=transaction.objectStore('archives'),request=records.get(key);
      request.onsuccess=()=>{injectedRevision=request.result.revision+1;records.put({...request.result,raw:broken,revision:injectedRevision},key);};
      transaction.oncomplete=resolve;transaction.onabort=()=>reject(transaction.error);
    });
    let succeeded=false,rejected='';
    try{await store.add(story?{...input,seed:'Must be rejected'}:{title:'Must be rejected',text:'This addition must not replace the invalid saved bytes.'});succeeded=true;}catch(error){rejected=error.message;}
    const saved=await new Promise((resolve,reject)=>{
      const transaction=db.transaction('archives','readonly'),request=transaction.objectStore('archives').get(key);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    db.close();
    return {succeeded,rejected,original:store.exportOriginal(),reason:store.recovery?.reason,persistent:store.persistent,savedRaw:saved.raw,savedRevision:saved.revision,injectedRevision,broken};
  },{kind,packet:FIRST_CONTACT});
  expect(result.succeeded).toBe(false);expect(result.rejected).not.toBe('');
  expect(result.original).toBe(result.broken);expect(result.reason).toBe('invalid');
  expect(result.persistent).toBe(false);expect(result.savedRaw).toBe(result.broken);
  expect(result.savedRevision).toBe(result.injectedRevision);
});

test('a notebook can be disabled for the visit after its durable storage becomes unavailable',async({page})=>{
  // Question: can a user stop notebook context after a real IndexedDB failure without changing saved preferences?
  // Limits: a controlled browser API failure, not a physical-device storage or voice reliability test.
  await openArchive(page);
  const result=await page.evaluate(async()=>{
    const {createKnowledge}=await import('/js/knowledge.js');
    const store=createKnowledge(localStorage);await store.ready;
    await store.add({title:'Lumen Harbor',text:'The violet lighthouse at Lumen Harbor has seven bells.'});
    const initialContext=store.context('How many bells does the violet lighthouse have?').length;
    const transaction=IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction=function(){throw new DOMException('Saved storage is blocked for this test.','InvalidStateError');};
    let refreshed,disabled,enableRejected='',disabledAfterFailedEnable;
    try{
      refreshed=await store.refresh();store.disableForVisit();
      disabled={enabled:store.enabled,context:store.context('Lumen Harbor bells')};
      try{await store.setEnabled(true);}catch(error){enableRejected=error.message;}
      disabledAfterFailedEnable={enabled:store.enabled,context:store.context('Lumen Harbor bells')};
    }finally{IDBDatabase.prototype.transaction=transaction;}
    const recovered=await store.refresh();
    const afterRefresh={enabled:store.enabled,context:store.context('Lumen Harbor bells')};
    const newVisit=createKnowledge(localStorage);await newVisit.ready;
    return {initialContext,refreshed,disabled,enableRejected,disabledAfterFailedEnable,recovered,afterRefresh,savedEnabled:newVisit.enabled,savedNotes:newVisit.list().length};
  });
  expect(result.initialContext).toBeGreaterThan(0);expect(result.refreshed).toBe(false);
  expect(result.disabled).toEqual({enabled:false,context:[]});
  expect(result.enableRejected).not.toBe('');expect(result.disabledAfterFailedEnable).toEqual({enabled:false,context:[]});
  expect(result.recovered).toBe(true);expect(result.afterRefresh).toEqual({enabled:false,context:[]});
  expect(result.savedEnabled).toBe(true);expect(result.savedNotes).toBe(1);
});
