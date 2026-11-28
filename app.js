'use strict';
const $ = (id) => document.getElementById(id);
const state = {catalog:null,level:'2',range:'501-600',count:20,minutes:8,deck:[],index:0,answer:[],bank:[],result:null,records:[],startedAt:0,deadline:null,ticker:null,done:false,bankSeed:[],cache:{}};
const storeKey='word-order-review-v1';
const shuffle = arr => {let a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function show(name){for(const id of ['home','play','results']) $(id).classList.toggle('hidden',id!==name);window.scrollTo({top:0,behavior:'instant'});}
function buttonGroup(id,options,value,onChange){const el=$(id);el.replaceChildren();options.forEach(opt=>{const b=document.createElement('button');b.type='button';b.className='choice'+(String(opt.value)===String(value)?' selected':'')+(opt.disabled?' disabled':'');b.textContent=opt.label;b.disabled=!!opt.disabled;b.setAttribute('aria-pressed',String(String(opt.value)===String(value)));b.onclick=()=>{onChange(opt.value);};el.appendChild(b);});}
function renderSettings(){const levels=state.catalog.levels;buttonGroup('levelButtons',levels.map(l=>({label:l.label,value:l.id,disabled:!l.ranges.length})),state.level,v=>{state.level=v;state.range=levels.find(x=>x.id===v).ranges[0].id;renderSettings();});const current=levels.find(l=>l.id===state.level);$('range').replaceChildren();for(const r of current.ranges){const o=document.createElement('option');o.value=r.id;o.textContent=r.label;$('range').appendChild(o);}$('range').value=state.range;buttonGroup('countButtons',[20,50,100].map(n=>({label:String(n),value:n})),state.count,v=>{state.count=Number(v);renderSettings();});buttonGroup('timeButtons',[5,8,10,15,0].map(n=>({label:n?`${n} MIN`:'∞',value:n})),state.minutes,v=>{state.minutes=Number(v);renderSettings();});}
function currentRange(){return state.catalog.levels.find(x=>x.id===state.level).ranges.find(x=>x.id===state.range);}
async function loadData(){const ref=currentRange();if(!ref)throw Error('Select an available vocabulary range.');if(!state.cache[ref.file]){let r=await fetch(ref.file,{cache:'no-cache'});if(!r.ok)throw Error(`Could not load ${ref.file} (HTTP ${r.status})`);let d=await r.json();if(!Array.isArray(d.questions)||!d.questions.length)throw Error('This range contains no questions.');state.cache[ref.file]=d.questions;}return state.cache[ref.file];}
async function begin(retryIds=null){$('setupMsg').textContent='';$('start').disabled=true;try{const data=await loadData();let selected=retryIds?data.filter(q=>retryIds.includes(q.id)):shuffle(data).slice(0,Math.min(state.count,data.length));if(!selected.length)throw Error('No questions available to retry.');state.deck=shuffle(selected);state.index=0;state.records=[];state.startedAt=Date.now();state.deadline=state.minutes?Date.now()+state.minutes*60000:null;state.done=false;$('playLevel').textContent=`LEVEL ${'★'.repeat(Number(state.level))} · ${state.range}`;show('play');renderQuestion();clearInterval(state.ticker);state.ticker=setInterval(updateClock,250);updateClock();}catch(err){$('setupMsg').textContent=err.message;show('home');}finally{$('start').disabled=false;}}
function current(){return state.deck[state.index];}
function renderQuestion(){clearDrag();state.done=false;state.answer=[];let q=current();state.bank=shuffle(q.tiles.map((text,id)=>({id,text})));$('qCounter').textContent=`QUESTION ${String(state.index+1).padStart(2,'0')} / ${String(state.deck.length).padStart(2,'0')}`;$('qNumber').textContent=`SOURCE NO. ${q.id}`;$('japanese').textContent=q.japanese;$('fixedPrefix').textContent=q.prefix;$('fixedSuffix').textContent=q.suffix;
  // Punctuation is not a pre-filled word: avoid rendering a large locked tile for "." or "?".
  for (const [id, value] of [['fixedPrefix', q.prefix], ['fixedSuffix', q.suffix]]) {
    const node = $(id);
    const punctuationOnly = /^[\s.,!?;:’”"']+$/.test(value || '');
    node.classList.toggle('fixed-punctuation', punctuationOnly);
    node.setAttribute('aria-label', punctuationOnly ? `Punctuation: ${value}` : `Given text: ${value}`);
  }$('feedback').classList.add('hidden');$('next').classList.add('hidden');$('submit').classList.remove('hidden');$('reset').disabled=false;$('skip').disabled=false;renderTiles();updateHud();}
function tileNode(tile,zone){const b=document.createElement('button');b.type='button';b.className='word-tile';b.dataset.id=tile.id;b.dataset.zone=zone;b.textContent=tile.text;b.setAttribute('aria-label',`${tile.text}, ${zone==='bank'?'move to answer':'return to word bank'}`);b.addEventListener('pointerdown',startPointer);b.addEventListener('keydown',e=>{if(state.done)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();moveByKeyboard(tile.id,zone,e.key==='ArrowLeft'?-1:1);}});return b;}
function renderTiles(focusId=null){if(activeDrag)clearDrag();$('answerZone').replaceChildren(...state.answer.map(t=>tileNode(t,'answer')));$('bankZone').replaceChildren(...state.bank.map(t=>tileNode(t,'bank')));let q=current();$('tileCount').textContent=`${state.answer.length} / ${q.tiles.length} TILES`;$('submit').disabled=state.done||state.answer.length!==q.tiles.length;$('reset').disabled=state.done||state.answer.length===0;if(focusId!==null){let node=[...document.querySelectorAll('.word-tile')].find(t=>Number(t.dataset.id)===focusId);node?.focus({preventScroll:true});}}
function moveTile(id,from,to,index=null){if(state.done)return;const source=from==='bank'?state.bank:state.answer;const target=to==='bank'?state.bank:state.answer;const i=source.findIndex(t=>t.id===id);if(i<0)return;const [item]=source.splice(i,1);/* index already excludes the dragged tile */if(index===null)target.push(item);else target.splice(Math.max(0,Math.min(index,target.length)),0,item);renderTiles(id);}
function moveByKeyboard(id,zone,dir){const list=zone==='answer'?state.answer:state.bank;let i=list.findIndex(t=>t.id===id);let newIndex=Math.max(0,Math.min(list.length-1,i+dir));if(newIndex===i)return;[list[i],list[newIndex]]=[list[newIndex],list[i]];renderTiles(id);}
// A drag has exactly one owner (pointerId). Document-level listeners survive
// DOM re-renders and release outside the source tile. Every exit removes overlays.
let activeDrag = null;
const dropMarker = document.createElement('span');
dropMarker.className = 'drop-insertion-marker';
dropMarker.setAttribute('aria-hidden', 'true');

function clearDrag() {
  const d = activeDrag;
  activeDrag = null; // clear ownership before removing elements/releasing capture
  document.removeEventListener('pointermove', movePointer, true);
  document.removeEventListener('pointerup', endPointer, true);
  document.removeEventListener('pointercancel', cancelPointer, true);
  document.removeEventListener('lostpointercapture', lostDragCapture, true);
  window.removeEventListener('blur', clearDrag);
  document.removeEventListener('visibilitychange', cancelHiddenDrag);
  if (d) {
    d.ghost?.remove();
    d.source?.classList.remove('drag-source');
    if (d.source?.hasPointerCapture?.(d.pointerId)) {
      try { d.source.releasePointerCapture(d.pointerId); } catch (_) {}
    }
  }
  dropMarker.remove();
  document.body.classList.remove('drag-active');
  for (const name of ['answerZone','bankZone']) $(name).classList.remove('drop-active');
}
function cancelHiddenDrag() { if (document.hidden) clearDrag(); }
function lostDragCapture(e) {
  if (activeDrag && e.pointerId === activeDrag.pointerId) clearDrag();
}
function startPointer(e) {
  if (state.done || (e.pointerType === 'mouse' && e.button !== 0) || activeDrag) return;
  const node = e.currentTarget;
  const id = Number(node.dataset.id);
  const from = node.dataset.zone;
  if (!(from === 'answer' ? state.answer : state.bank).some(t=>t.id===id)) return;
  activeDrag = { pointerId:e.pointerId, id, from, x:e.clientX, y:e.clientY,
    dragged:false, ghost:null, source:node, target:null, index:null };
  document.addEventListener('pointermove', movePointer, true);
  document.addEventListener('pointerup', endPointer, true);
  document.addEventListener('pointercancel', cancelPointer, true);
  document.addEventListener('lostpointercapture', lostDragCapture, true);
  window.addEventListener('blur', clearDrag);
  document.addEventListener('visibilitychange', cancelHiddenDrag);
  try { node.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault(); // suppress synthetic click, scrolling or text selection
}
function locateDrop(e) {
  const el=document.elementFromPoint(e.clientX,e.clientY);
  const zone=el?.closest('#answerZone,#bankZone');
  if (!zone) return {target:null,index:null,zone:null,cards:[]};
  const target=zone.id==='answerZone'?'answer':'bank';
  // Exclude the dragged source entirely: only the remaining tokens determine gaps.
  const cards=[...zone.querySelectorAll('.word-tile')].filter(n=>
    !activeDrag || !(n.dataset.zone===activeDrag.from && Number(n.dataset.id)===activeDrag.id));
  let index=cards.length;
  // Compare rows first, then horizontal centers; marker is out-of-flow.
  for (let i=0;i<cards.length;i++) {
    const r=cards[i].getBoundingClientRect();
    if (e.clientY < r.top || (e.clientY <= r.bottom && e.clientX < r.left+r.width/2)) {
      index=i;break;
    }
  }
  return {target,index,zone,cards};
}
function displayDropTarget(drop) {
  for (const name of ['answerZone','bankZone'])
    $(name).classList.toggle('drop-active',$(name)===drop.zone);
  dropMarker.remove();
  if (!drop.zone) return;
  // The insertion line is absolutely positioned over the zone and NEVER
  // occupies a flex item slot, so moving it cannot shuffle tiles under the pointer.
  const zoneRect=drop.zone.getBoundingClientRect();
  const prev=drop.cards[drop.index-1]?.getBoundingClientRect();
  const next=drop.cards[drop.index]?.getBoundingClientRect();
  let x,y,height;
  if (next) {
    x=next.left-5;
    y=next.top;
    height=next.height;
    if (prev && Math.abs(prev.top-next.top)<Math.min(prev.height,next.height)/2) {
      x=(prev.right+next.left)/2;
    }
  } else if(prev) {
    x=prev.right+5;y=prev.top;height=prev.height;
  } else {
    x=zoneRect.left+Math.min(22,zoneRect.width/3);
    y=zoneRect.top+10;height=Math.max(30,zoneRect.height-20);
  }
  const inset=8;
  dropMarker.style.left=`${Math.max(inset,Math.min(x-zoneRect.left,zoneRect.width-inset))}px`;
  dropMarker.style.top=`${Math.max(inset, y-zoneRect.top)}px`;
  dropMarker.style.height=`${Math.max(28,height)}px`;
  drop.zone.appendChild(dropMarker);
}
function movePointer(e) {
  const d=activeDrag;
  if (!d || e.pointerId!==d.pointerId) return;
  if (!d.dragged && Math.hypot(e.clientX-d.x,e.clientY-d.y)>9) {
    d.dragged=true;
    d.source.classList.add('drag-source');
    const item=(d.from==='bank'?state.bank:state.answer).find(t=>t.id===d.id);
    if (!item) {clearDrag();return;}
    d.ghost=document.createElement('div');
    d.ghost.className='word-tile dragging-ghost';
    d.ghost.textContent=item.text;
    d.ghost.setAttribute('aria-hidden','true');
    document.body.appendChild(d.ghost);
    document.body.classList.add('drag-active');
  }
  if (!d.ghost) return;
  d.ghost.style.left=`${e.clientX}px`;
  d.ghost.style.top=`${e.clientY}px`;
  const drop=locateDrop(e);
  d.target=drop.target;d.index=drop.index;
  displayDropTarget(drop);
  e.preventDefault();
}
function endPointer(e) {
  const d=activeDrag;
  if (!d || e.pointerId!==d.pointerId) return;
  const drop=d.dragged?locateDrop(e):null;
  const id=d.id,from=d.from,dragged=d.dragged;
  clearDrag();
  if (dragged) {
    if (drop?.target) moveTile(id,from,drop.target,drop.index);
  } else moveTile(id,from,from==='bank'?'answer':'bank');
  e.preventDefault();
}
function cancelPointer(e) {
  if(activeDrag && e.pointerId===activeDrag.pointerId) clearDrag();
}
function resetAnswer(){clearDrag();if(state.done)return;state.bank=shuffle([...state.bank,...state.answer]);state.answer=[];renderTiles();}
function correctText(q){return q.correctOrder.map(i=>q.tiles[i]).join(' ');}
function orderKey(words){return words.map(w=>w.normalize('NFKC').toLocaleLowerCase()).join(' ');}
function assessAnswer(q, selectedWords){
  const key=orderKey(selectedWords);
  if(key===orderKey(q.correctOrder.map(i=>q.tiles[i])))return {correct:true,alternative:false,note:''};
  const match=(q.alternatives||[]).find(alt=>key===orderKey(alt.order.map(i=>q.tiles[i])));
  return match?{correct:true,alternative:true,note:match.note||''}:{correct:false,alternative:false,note:''};
}
function skipQuestion(){
  clearDrag();
  if(state.done||!state.deck.length)return;
  const q=current();
  state.done=true;
  state.records.push({id:q.id,japanese:q.japanese,chosen:state.answer.map(t=>t.text).join(' '),answer:q.answer,focus:q.focus,status:'skipped',prefix:q.prefix,suffix:q.suffix,punctuationAfter:q.punctuationAfter||[]});
  updateHud();
  if(state.index>=state.deck.length-1){finish('complete');return;}
  state.index++;renderQuestion();window.scrollTo({top:0,behavior:'smooth'});
}
function submit(){
  clearDrag();
  if(state.done)return;
  const q=current();
  if(state.answer.length!==q.tiles.length)return;
  const chosen=state.answer.map(t=>t.text);
  const assessment=assessAnswer(q,chosen);
  const correct=assessment.correct;
  state.done=true;
  state.records.push({id:q.id,japanese:q.japanese,chosen:chosen.join(' '),answer:q.answer,focus:q.focus,status:correct?'correct':'incorrect',alternative:assessment.alternative,prefix:q.prefix,suffix:q.suffix,punctuationAfter:q.punctuationAfter||[]});
  const altNote=assessment.alternative?`<div class="alternative-note" lang="ja">${escapeHtml(assessment.note)}</div>`:'';
  const submittedAnswer=assessment.alternative?`<div class="feedback-label">YOUR ANSWER — ACCEPTED</div><div class="feedback-answer accepted-answer">${escapeHtml(assemble(q,chosen.join(' ')))}</div>`:'';
  $('feedback').classList.remove('hidden');
  $('feedback').innerHTML=`<div class="feedback-status ${correct?'is-correct':'is-wrong'}">${assessment.alternative?'✓ CORRECT — ALTERNATIVE ANSWER':correct?'✓ CORRECT':'✕ NOT QUITE'}</div>${!correct?`<div class="feedback-label">YOUR ANSWER</div><div class="feedback-answer">${escapeHtml(assemble(q,chosen.join(' ')))}</div>`:submittedAnswer}<div class="feedback-label">${assessment.alternative?'TEXTBOOK ANSWER':'CORRECT ANSWER'}</div><div class="feedback-answer right-answer">${escapeHtml(pretty(q.answer))}</div>${altNote}<div class="language-focus"><div class="focus-kicker">✳ LANGUAGE FOCUS <span>${escapeHtml(q.category)}</span></div><p lang="ja">${escapeHtml(q.focus)}</p></div>`;
  $('submit').classList.add('hidden');
  $('skip').disabled=true;
  $('next').classList.remove('hidden');
  $('next').textContent=state.index===state.deck.length-1?'VIEW RESULTS →':'NEXT QUESTION →';
  renderTiles();updateHud();
  $('feedback').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function pretty(s){return s.replace(/,([^\s])/g,', $1');}
function assemble(q,arr){
  let s=[q.prefix,arr,q.suffix].filter(Boolean).join(' ');
  // Non-selectable punctuation is display-only; it never changes word-order scoring.
  for(const word of (q.punctuationAfter||[])){
    if(!/^[a-z]+$/i.test(word))continue;
    s=s.replace(new RegExp(String.raw`\b(${word})\b(?=\s|$)`,'i'),'$1,');
  }
  return pretty(s).replace(/\s+([.,?!])/g,'$1').replace(/([“‘])\s+/g,'$1');
}
function next(){if(!state.done)return;if(state.index>=state.deck.length-1){finish('complete');return;}state.index++;renderQuestion();window.scrollTo({top:0,behavior:'smooth'});}
function accuracy(){const yes=state.records.filter(r=>r.status==='correct').length;const attempted=state.records.filter(r=>r.status==='correct'||r.status==='incorrect').length;return attempted?`${Math.round(yes/attempted*100)}%`:'—';}
function updateHud(){const total=state.deck.length;$('progressText').textContent=`${state.records.length} / ${total}`;$('accuracyText').textContent=accuracy();$('progressFill').style.width=`${state.records.length/total*100}%`;}
function formatTime(ms){const sec=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
function updateClock(){if($('play').classList.contains('hidden'))return;if(!state.deadline){$('timeText').textContent='∞';return;}const left=state.deadline-Date.now();$('timeText').textContent=formatTime(left);$('timeText').classList.toggle('urgent',left<=30000);if(left<=0)finish('time');}
function finish(reason){clearDrag();clearInterval(state.ticker);state.ticker=null;if(!state.deck.length)return;const answered=new Set(state.records.map(r=>r.id));for(const q of state.deck)if(!answered.has(q.id))state.records.push({id:q.id,japanese:q.japanese,chosen:'',answer:q.answer,focus:q.focus,status:'unanswered',prefix:q.prefix,suffix:q.suffix});const correct=state.records.filter(r=>r.status==='correct').length;const wrong=state.records.filter(r=>r.status==='incorrect').length;const skipped=state.records.filter(r=>r.status==='skipped').length;const unanswered=state.records.filter(r=>r.status==='unanswered').length;const attempted=correct+wrong;const total=state.deck.length;const used=Math.min(Date.now()-state.startedAt,state.minutes?state.minutes*60000:Infinity);$('resultTitle').innerHTML=reason==='time'?'Time is up<span class="period">.</span>':reason==='exit'?'Session ended<span class="period">.</span>':'Well built<span class="period">.</span>';$('resultMessage').textContent=`Level ${'★'.repeat(Number(state.level))} · ${state.range} · ${total} questions`;$('resultAccuracy').textContent=attempted?`${Math.round(correct/attempted*100)}%`:'—';$('resultCompletion').textContent=`${attempted+skipped}/${total}`;$('resultTime').textContent=formatTime(used);$('resultBars').innerHTML=[['CORRECT',correct,'correct'],['INCORRECT',wrong,'incorrect'],['SKIPPED',skipped,'skipped'],['UNANSWERED',unanswered,'unanswered']].map(([label,value,k])=>`<div class="bar-item"><div class="bar-row"><span>${label}</span><strong>${value}</strong></div><div class="bar-track"><div class="bar-fill ${k}" style="width:${value/total*100}%"></div></div></div>`).join('');$('retry').disabled=wrong+skipped+unanswered===0;state.result={level:state.level,range:state.range,count:total,minutes:state.minutes,records:[...state.records],savedAt:new Date().toISOString()};try{localStorage.setItem(storeKey,JSON.stringify(state.result));}catch(e){}show('results');}
function escapeCsv(s){return '"'+String(s??'').replaceAll('"','""')+'"';}
function downloadCsv(){const source=state.result||(()=>{try{return JSON.parse(localStorage.getItem(storeKey)||'null');}catch(e){return null;}})();if(!source)return;const rows=[['No.','Status','Japanese','Your Answer','Correct Answer','Language Focus'],...source.records.filter(r=>r.status!=='correct').map(r=>[r.id,r.status,r.japanese,r.chosen?assemble(r,r.chosen):'',pretty(r.answer),r.focus])];const content='\ufeff'+rows.map(row=>row.map(escapeCsv).join(',')).join('\r\n');const blob=new Blob([content],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`word-order-review-level-${source.level}-${source.range}-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function retry(){const ids=state.result?.records.filter(x=>x.status!=='correct').map(x=>x.id)||[];if(!ids.length)return;await begin(ids);}
function confirmExit(){clearDrag();clearInterval(state.ticker);state.ticker=setInterval(updateClock,250);$('confirmOverlay').classList.remove('hidden');}
function closeExit(){$('confirmOverlay').classList.add('hidden');}
async function init(){try{const r=await fetch('catalog.json',{cache:'no-cache'});if(!r.ok)throw Error('Could not load catalog.json');state.catalog=await r.json();renderSettings();}catch(err){$('setupMsg').textContent=err.message;$('start').disabled=true;} $('range').addEventListener('change',e=>{state.range=e.target.value;});$('start').onclick=()=>begin();$('submit').onclick=submit;$('reset').onclick=resetAnswer;$('skip').onclick=skipQuestion;$('next').onclick=next;$('homeBtn').onclick=confirmExit;$('cancelExit').onclick=closeExit;$('confirmExit').onclick=()=>{closeExit();finish('exit');};$('download').onclick=downloadCsv;$('retry').onclick=retry;$('resultHome').onclick=()=>show('home');document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateClock();});}
init();
