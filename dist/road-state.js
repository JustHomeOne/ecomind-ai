import {DEPOT,selectStops} from './data.js';
import {createRoadRouter,networkKey,ROUTING_SOURCE} from './routing.js';

export function createRoadState({getContainers,getOptions,onChange=()=>{},router=createRoadRouter()}){
  const state={network:null,networkKey:'',networkStatus:'idle',networkError:'',plan:null,planKey:'',status:'idle',error:''};
  let networkPromise,routePromise,networkVersion=0,routeVersion=0,notifyPending=false;
  const getStops=()=>{const options=getOptions();return selectStops(getContainers(),options.policy,options.threshold,options.horizon);};
  const getKey=()=>networkKey(getContainers())+'|'+getStops().map(p=>p.id).join(',');
  function notify(){if(notifyPending)return;notifyPending=true;queueMicrotask(()=>{notifyPending=false;onChange(state);});}
  function sync(){
    const key=getKey();
    if(state.planKey&&state.planKey!==key){state.plan=null;state.status='idle';state.error='';}
    const netKey=networkKey(getContainers());
    if(state.networkKey&&state.networkKey!==netKey){state.network=null;state.networkStatus='idle';state.networkError='';}
  }
  async function ensureNetwork(force=false){
    const key=networkKey(getContainers());
    if(state.networkKey===key){
      if(state.networkStatus==='ready')return state.network;
      if(state.networkStatus==='loading')return networkPromise;
      if(state.networkStatus==='error'&&!force)return null;
    }
    const version=++networkVersion;state.networkKey=key;state.networkStatus='loading';state.networkError='';state.network=null;notify();
    networkPromise=(async()=>{
      try{
        const network=await router.getNetwork(getContainers());
        if(version!==networkVersion||key!==networkKey(getContainers()))return null;
        state.network=network;state.networkStatus='ready';notify();return network;
      }catch(error){if(version===networkVersion){state.networkStatus='error';state.networkError=error.message||'Не удалось получить дорожные расстояния.';notify();}return null;}
    })();
    return networkPromise;
  }
  async function ensureRoute(force=false){
    const key=getKey();
    if(state.planKey===key){
      if(state.status==='ready')return state.plan;
      if(state.status==='loading')return routePromise;
      if(state.status==='error'&&!force)return null;
    }
    const version=++routeVersion,stops=getStops();
    state.planKey=key;state.status='loading';state.error='';state.plan=null;notify();
    routePromise=(async()=>{
      try{
        let plan;
        if(!stops.length)plan={points:[DEPOT,DEPOT],baseline:[DEPOT,DEPOT],distance:0,originalDistance:0,duration:0,originalDuration:0,saving:0,geometry:null,snaps:[],source:ROUTING_SOURCE};
        else{
          const network=await ensureNetwork(force);
          if(!network)throw new Error(state.networkError||'Не удалось получить дорожные расстояния.');
          if(version!==routeVersion||key!==getKey())return null;
          plan=await router.buildPlan(network,stops);
        }
        if(version!==routeVersion||key!==getKey())return null;
        state.plan=plan;state.status='ready';notify();return plan;
      }catch(error){if(version===routeVersion&&key===getKey()){state.status='error';state.error=error.message||'Не удалось построить маршрут по дорогам.';state.plan=null;notify();}return null;}
    })();
    return routePromise;
  }
  function current(){
    if(state.status!=='ready'||state.planKey!==getKey())return null;
    const records=new Map(getContainers().map(record=>[record.id,record]));
    return {...state.plan,points:state.plan.points.map(point=>records.get(point.id)||point)};
  }
  return {state,sync,ensureNetwork,ensureRoute,current};
}
