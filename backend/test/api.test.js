const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'expense-quest-'));
process.env.DATABASE_PATH=path.join(temp,'test.sqlite');
process.env.FRONTEND_ORIGIN='http://localhost:3000';
const {app,db}=require('../src/server');
let server,base,questId,transactionId;
before(async()=>{server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(temp,{recursive:true,force:true})});
async function json(url,options){const r=await fetch(base+url,options);return {status:r.status,data:await r.json()}}
test('health endpoint is live',async()=>{const r=await json('/api/health');assert.equal(r.status,200);assert.equal(r.data.status,'ok')});
test('upload validates and categorizes actual CSV rows',async()=>{
 const form=new FormData();form.append('file',new Blob(['Date,Merchant,Amount\n2026-02-01,Swiggy dinner,420.50\n2026-02-02,Metro card,300\n'],{type:'text/csv'}),'expenses.csv');
 const r=await fetch(base+'/api/quests/upload',{method:'POST',body:form});const d=await r.json();assert.equal(r.status,201);assert.equal(d.quest.totalTransactions,2);assert.equal(d.preview[0].suggestedCategory,'Food');assert.equal(d.preview[1].suggestedCategory,'Travel');questId=d.quest.id;transactionId=d.preview[0].id;
});
test('rejects malformed expense CSV',async()=>{const form=new FormData();form.append('file',new Blob(['Date,Amount\n2026-02-01,12'],{type:'text/csv'}),'bad.csv');const r=await fetch(base+'/api/quests/upload',{method:'POST',body:form});assert.equal(r.status,400)});
test('review grants XP once, updates progress, reports and export use stored data',async()=>{
 let r=await json(`/api/transactions/${transactionId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:'Food'})});assert.equal(r.status,200);assert.equal(r.data.player.xp,10);assert.equal(r.data.quest.bossHealth,50);
 r=await json(`/api/transactions/${transactionId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:'Food'})});assert.equal(r.status,409);
 const p=await json('/api/player');assert.equal(p.data.player.xp,10);assert.equal(p.data.player.level,1);
 const report=await json(`/api/quests/${questId}/report`);assert.equal(report.data.report.totalExpenses,720.5);assert.equal(report.data.report.highestSpendingCategory,'Food');
 const csv=await fetch(base+`/api/quests/${questId}/export`);assert.equal(csv.status,200);assert.match(await csv.text(),/Final Category/);
});
test('undo reverses progress and XP',async()=>{const r=await json(`/api/transactions/${transactionId}/undo`,{method:'POST'});assert.equal(r.status,200);assert.equal(r.data.player.xp,0);assert.equal(r.data.quest.progress.reviewed,0)});
