import test from 'node:test';
import assert from 'node:assert/strict';
import {teamAPI} from '../worker/team.js';
import {localStorageBindings} from '../scripts/local-storage.mjs';
import {emptyOps} from '../dist/operations.js';
const request=(path,method='GET',data,user='owner')=>new Request('https://example.com/api/team/'+path,{method,headers:{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@test.example','Content-Type':'application/json',Origin:'https://example.com'},...(data?{body:JSON.stringify(data)}:{})});
test('cloud membership, roles, revision conflicts and durable state are enforced server-side',async()=>{
  const env=localStorageBindings({memory:true});try{
    assert.equal((await teamAPI(new Request('https://example.com/api/team/workspaces'),env)).status,401);
    const space=await(await teamAPI(request('workspaces','POST',{name:'Pilot'}),env)).json();const path='workspaces/'+space.id;
    assert.equal((await teamAPI(request(path,'GET',null,'outsider'),env)).status,403);
    const seed=await teamAPI(request(path+'/changes','POST',{baseRevision:0,op:{id:'seed',type:'seed',snapshot:emptyOps()}}),env);assert.equal(seed.status,200);
    assert.equal((await teamAPI(request(path+'/changes','POST',{baseRevision:0,op:{id:'old',type:'observe'}}),env)).status,409);
    await teamAPI(request(path+'/invites','POST',{email:'driver@test.example',role:'driver'}),env);
    const invites=await(await teamAPI(request('workspaces','GET',null,'driver'),env)).json();assert.equal(invites.invitations.length,1);
    await teamAPI(request('join','POST',{inviteId:invites.invitations[0].id},'driver'),env);
    const denied=await teamAPI(request(path+'/changes','POST',{baseRevision:1,op:{id:'bad',type:'import',containers:[]}},'driver'),env);assert.ok(denied.status>=400);
    const update=await teamAPI(request(path+'/changes','POST',{baseRevision:1,op:{id:'observation',type:'observe',containerId:'EM-001',fill:40,note:'Observed'}},'driver'),env);assert.equal(update.status,200);
    const loaded=await(await teamAPI(request(path),env)).json();assert.equal(loaded.snapshot.containers[0].fill,40);assert.equal(loaded.revision,2);assert.equal(loaded.snapshot.events.at(-1).actor,'driver@test.example');
    assert.equal((await teamAPI(request(path+'/invites','POST',{email:'new@test.example',role:'owner'},'driver'),env)).status,403);
    const cross=request(path+'/changes','POST',{baseRevision:2,op:{}});cross.headers.set('Origin','https://evil.example');assert.equal((await teamAPI(cross,env)).status,403);
  }finally{env.close();}
});
test('photos require workspace membership and viewers cannot write',async()=>{
  const env=localStorageBindings({memory:true});try{
    const space=await(await teamAPI(request('workspaces','POST',{name:'Photos'}),env)).json(),path='workspaces/'+space.id;
    const photoPath='https://example.com/api/team/'+path+'/photos/photo-1';
    const upload=new Request(photoPath,{method:'PUT',headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@test.example','Content-Type':'image/jpeg'},body:new Uint8Array([255,216,255,0])});
    assert.equal((await teamAPI(upload,env)).status,200);assert.equal((await teamAPI(request(path+'/photos/photo-1'),env)).status,200);
    assert.equal((await teamAPI(request(path+'/photos/photo-1','GET',null,'outsider'),env)).status,403);
    await teamAPI(request(path+'/invites','POST',{email:'viewer@test.example',role:'viewer'}),env);
    const list=await(await teamAPI(request('workspaces','GET',null,'viewer'),env)).json();await teamAPI(request('join','POST',{inviteId:list.invitations[0].id},'viewer'),env);
    assert.equal((await teamAPI(request(path+'/changes','POST',{baseRevision:0,op:{id:'write',type:'observe'}},'viewer'),env)).status,403);
    assert.equal((await teamAPI(request(path+'/photos/photo-1','GET',null,'viewer'),env)).status,200);
    await teamAPI(request(path+'/members/viewer','DELETE'),env);
    assert.equal((await teamAPI(request(path+'/photos/photo-1','GET',null,'viewer'),env)).status,403);
  }finally{env.close();}
});
