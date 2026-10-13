// Regression tests for scorer integrity; fixtures test the scorer, not the language model.
// Execute: node eval/test_scorer.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, readCrm } from './lib.mjs';
const target=path.join(ROOT,'eval/score.mjs');
const base=JSON.parse(fs.readFileSync(path.join(ROOT,'eval/fixtures/perfect_results.json')));
// Dataset specific test inputs live in the ignored eval/cases.json.
const R=JSON.parse(fs.readFileSync(path.join(ROOT,'eval/cases.json'))).regression;
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'atliq-regression-'));
let passed=0, failed=0;
const test=(name,mutation,expectedExit)=>{
 const r=JSON.parse(JSON.stringify(base));mutation(r);
 const file=path.join(scratch,name.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json');
 fs.writeFileSync(file,JSON.stringify(r));
 const out=spawnSync(process.execPath,[target,file],{cwd:ROOT,encoding:'utf8'});
 const actual=out.status;
 const ok=actual===expectedExit;
 (ok?passed++:failed++);
 console.log(`${ok?'PASS':'FAIL'} ${name}: expected exit ${expectedExit}, got ${actual}`);
 if(!ok)console.log((out.stderr||out.stdout).slice(-1200));
};
test('perfect fixture',()=>{},0);
test('all identities replaced',r=>{for(const x of r.items){x.account='Fictitious Company';x.lead_id='L-9999';}},1);
test('all waiting days fabricated',r=>{for(const x of r.waiting_customers)x.days_waiting=999;},1);
test('all item types wrong',r=>{for(const x of r.items)if(x.type!=='nudge_due')x.type='nudge_due';},1);
test('20 duplicates',r=>{for(let i=0;i<20;i++)r.items.push({...r.items[0],id:'dup-'+i});},1);
test('accepted milestone surfaced with its next step date passes',r=>{const m=R.accepted_milestone;r.items.push({...r.items[0],id:'milestone-1',file:m.file,type:m.type,account:m.account,lead_id:m.lead_id,quote:m.quote,owner:m.owner,owner_from:'crm',due_date:m.due_date,due_text:null,due_approx:false,days_waiting:null,needs_review:false});r.crm_changes.push({id:'c-nf-ms',lead_id:m.lead_id,field:'next_followup_date',current:null,proposed:m.due_date,quote:null,file:null,set_by:'rule'});},0);
test('accepted milestone with an invented date fails',r=>{const m=R.accepted_milestone;r.items.push({...r.items[0],id:'milestone-3',file:m.file,type:m.type,account:m.account,lead_id:m.lead_id,quote:m.quote,owner:m.owner,owner_from:'crm',due_date:'2026-07-30',due_text:null,due_approx:false,days_waiting:null,needs_review:false});},1);
test('accepted milestone on a wrong account fails',r=>{const m=R.accepted_milestone;r.items.push({...r.items[0],id:'milestone-2',file:m.file,type:m.type,account:'Fictitious Company',lead_id:'L-9999',quote:m.quote,owner:m.owner,owner_from:'crm',due_date:m.due_date,due_text:null,due_approx:false,days_waiting:null,needs_review:false});},1);
// Every accepted passage the key allows, surfaced on its own account, must still pass.
test('all accepted passages surfaced passes',r=>{
  const K=JSON.parse(fs.readFileSync(path.join(ROOT,'eval/answer_key.json')));
  const crm=Object.fromEntries(readCrm().map(c=>[c.lead_id,c.company]));
  K.labels.filter(l=>l.tier==='accept'&&!l.needs_review).forEach((l,n)=>{
    const d=K.documents.find(x=>x.file===l.file); const acc=d.accounts_expected[0];
    const isNew=acc.startsWith('NEW:'); const tmpl=r.items.find(i=>i.lead_id===acc)||r.items[0];
    r.items.push({...r.items[0],id:'acc-'+n,file:l.file,type:l.type,account:isNew?acc.slice(4):(crm[acc]||tmpl.account),lead_id:isNew?null:acc,
      quote:l.spans[0],owner:null,owner_from:null,due_date:null,due_text:null,due_approx:false,needs_review:false,
      days_waiting:l.type==='reply_owed'&&d.last_external_message_date?Math.round((Date.parse(K.meta.reference_date)-Date.parse(d.last_external_message_date))/86400000):null});
  });
},0);
test('allowed next step row with a wrong date',r=>{r.crm_changes.push({id:'c-nf-extra',lead_id:Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT,'eval/answer_key.json'))).crm.rule_fields.next_followup_date_accept)[0],field:'next_followup_date',current:null,proposed:'2026-12-31',quote:null,file:null,set_by:'rule'});},1);
test('missing deterministic CRM date changes',r=>{r.crm_changes=r.crm_changes.filter(x=>!['last_contact_date','next_followup_date'].includes(x.field));},1);
test('run telemetry missing',r=>{delete r.run.cost_usd;delete r.run.duration_seconds;},1);
test('spurious nudge',r=>{const n=R.spurious_nudge;r.items.push({...r.items[0],id:'extra-nudge',type:'nudge_due',file:n.file,account:n.account,lead_id:n.lead_id,quote:n.quote});},1);
test('invented status',r=>{r.crm_changes.find(x=>x.lead_id===R.invented_status_lead&&x.field==='status').proposed='Won';},1);
test('new row invented value and status',r=>{const c=r.crm_changes.find(x=>x.field==='new_row');c.proposed.est_value_usd=9000000;c.proposed.status='Won';},1);
test('note claims contract signed and paid without source',r=>{const c=r.crm_changes.find(x=>x.field==='notes' && x.lead_id===R.unsupported_note_lead);c.proposed='Contract signed, invoice paid and client confirmed $9 million in revenue.';},1);

test('missing North Star customer',r=>{r.waiting_customers.pop();},1);
// Uncertainty text must not mask a fabricated obligation.
test('ambiguous note used for fictitious tasks',r=>{
  const template=r.items.find(x=>x.file===R.unclear_note.file);
  for(let n=0;n<20;n++) r.items.push({...template,id:'unclear-fake-'+n,quote:R.unclear_note.quote,summary:'Promise to deliver 1 million dollars tomorrow',type:'promise',needs_review:true});
},1);
const compare=(name,mutation,expectedExit)=>{
 const second=JSON.parse(JSON.stringify(base)); mutation(second);
 const secondPath=path.join(scratch,name+'.json'); fs.writeFileSync(secondPath,JSON.stringify(second));
 const out=spawnSync(process.execPath,[target,'--compare',path.join(ROOT,'eval/fixtures/perfect_results.json'),secondPath],{cwd:ROOT,encoding:'utf8'});
 const ok=out.status===expectedExit;(ok?passed++:failed++);
 console.log(`${ok?'PASS':'FAIL'} ${name}: expected exit ${expectedExit}, got ${out.status}`);
 if(!ok)console.log((out.stderr||out.stdout).slice(-1000));
};
compare('second-run-wrong-account',r=>{for(const i of r.items){i.account='Fictitious Ltd';i.lead_id='L-9999';}},1);
compare('second-run-different-model',r=>{r.run.model='another-model';},1);
compare('identical-run',r=>{},0);
compare('second-run-summaries-reworded',r=>{for(const i of r.items){i.summary='Reworded. '+(i.summary||'');}},0);
compare('second-run-due-dates-moved',r=>{for(const i of r.items)if(i.due_date)i.due_date='2026-12-31';},1);
compare('second-run-owners-changed',r=>{for(const i of r.items)i.owner='Someone Else';},1);
const fixtureRelease=spawnSync(process.execPath,[target,path.join(ROOT,'eval/fixtures/perfect_results.json'),'--release'],{cwd:ROOT,encoding:'utf8'});
const okRelease=fixtureRelease.status===1;(okRelease?passed++:failed++);
console.log(`${okRelease?'PASS':'FAIL'} fixture rejected in release mode`);
fs.rmSync(scratch,{recursive:true,force:true});
console.log(`${passed} regression tests passed, ${failed} failed`);
process.exit(failed?1:0);
