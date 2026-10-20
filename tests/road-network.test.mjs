import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNetwork,planOnNetwork,parseRoadRoute,createRoadRouter} from '../dist/routing.js';
import {createRoadState} from '../dist/road-state.js';
import {DEPOT} from '../dist/data.js';
const stops=[{id:'a',lng:71.42,lat:51.13,fill:90},{id:'b',lng:71.43,lat:51.14,fill:80},{id:'c',lng:71.44,lat:51.15,fill:50}];
const points=[DEPOT,...stops];
const distances=[[0,900,100,600],[100,0,900,300],[700,100,0,600],[100,900,100,0]];
const network=()=>parseNetwork({code:'Ok',distances:structuredClone(distances),durations:distances.map(row=>row.map(v=>v/10))},points);
function cost(route,matrix){return route.slice(1).reduce((sum,p,i)=>sum+matrix[points.findIndex(x=>x.id===route[i].id)][points.findIndex(x=>x.id===p.id)],0);}
function routePayload(route,meters=2000){return {code:'Ok',routes:[{distance:meters,duration:240,geometry:{type:'LineString',coordinates:route.map(p=>[p.lng,p.lat])}}],waypoints:route.map(p=>({location:[p.lng,p.lat],distance:12,name:'Road'}))};}
test('directed road optimization preserves stops and reports the full directed cost',()=>{
  const plan=planOnNetwork(network(),stops);
  assert.deepEqual(plan.points.slice(1,-1).map(p=>p.id).sort(),['a','b','c']);
  assert.equal(plan.points[0].id,'depot');assert.equal(plan.points.at(-1).id,'depot');
  assert.equal(plan.distance,cost(plan.points,distances)/1000);
  assert.ok(plan.distance<=plan.originalDistance);assert.ok(plan.saving>=0);
  assert.equal(plan.duration,cost(plan.points,distances)/10);
  assert.equal(plan.geometry,null);
});
test('unreachable roads and malformed geometry never produce a straight-line fallback',()=>{
  const bad=network();bad.distances[1][2]=null;
  assert.throws(()=>planOnNetwork(bad,stops));
  assert.throws(()=>parseRoadRoute({code:'NoRoute'},points));
  const far=routePayload(points);far.waypoints[1].distance=401;
  assert.throws(()=>parseRoadRoute(far,points));
  assert.throws(()=>parseNetwork({code:'Ok',distances:[[0]],durations:[[0]]},points));
});
test('identical concurrent road requests share a response, failures are retried',async()=>{
  let calls=0,fail=true;
  const router=createRoadRouter({intervalMs:0,fetcher:async()=>{calls++;if(fail)return {ok:false,status:503};return {ok:true,json:async()=>routePayload(points)};}});
  await assert.rejects(router.getRoute(points));fail=false;
  const [first,second]=await Promise.all([router.getRoute(points),router.getRoute(points)]);
  assert.deepEqual(first,second);assert.equal(calls,2);
  await router.getRoute(points);assert.equal(calls,2);
});
test('full road geometry can select baseline when a route is longer than matrix estimate',async()=>{
  let calls=0;
  const router=createRoadRouter({intervalMs:0,fetcher:async url=>{
    calls++;const coords=url.split('/driving/')[1].split('?')[0].split(';').map(s=>s.split(',').map(Number));
    const route=coords.map(([lng,lat])=>({lng,lat}));
    return {ok:true,json:async()=>routePayload(route,calls===1?4000:3000)};
  }});
  const plan=await router.buildPlan(network(),stops);
  assert.equal(calls,2);assert.equal(plan.distance,3);assert.equal(plan.saving,0);
  assert.deepEqual(plan.points.map(p=>p.id),['depot','a','b','c','depot']);
  assert.equal(plan.geometry.type,'LineString');
});
test('a changed threshold cannot display a late route from an older selection',async()=>{
  let options={policy:'current',threshold:75,horizon:12},release;
  const controller=createRoadState({getContainers:()=>stops,getOptions:()=>options,router:{getNetwork:async()=>network(),buildPlan:async(net,chosen)=>{await new Promise(resolve=>release=resolve);return planOnNetwork(net,chosen);}}});
  const pending=controller.ensureRoute();await new Promise(resolve=>setImmediate(resolve));
  options={...options,threshold:95};controller.sync();
  await controller.ensureRoute();release();await pending;
  assert.equal(controller.state.status,'ready');assert.equal(controller.current().distance,0);
  assert.equal(controller.current().geometry,null);assert.equal(controller.current().points.length,2);
});
test('empty selection avoids external routing; failed routes stay unavailable until retry',async()=>{
  let threshold=95,calls=0;
  const controller=createRoadState({getContainers:()=>stops,getOptions:()=>({policy:'current',threshold}),router:{getNetwork:async()=>{calls++;throw new Error('offline');}}});
  await controller.ensureRoute();assert.equal(calls,0);assert.equal(controller.current().distance,0);
  threshold=75;controller.sync();await controller.ensureRoute();
  assert.equal(controller.state.status,'error');assert.equal(controller.current(),null);assert.equal(calls,1);
  await controller.ensureRoute();assert.equal(calls,1);
  await controller.ensureRoute(true);assert.equal(calls,2);
});
