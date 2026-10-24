import {ASTANA_DISTRICTS,DISTRICT_SOURCE} from './astana-districts-data.js';
import {airColor} from './air-map.js';
export {ASTANA_DISTRICTS,DISTRICT_SOURCE};

// 1 = inside, 0 = edge, -1 = outside. Holes and islands are retained.
function ringPosition(point,ring){
  const [x,y]=point;let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i],[xj,yj]=ring[j],cross=(x-xi)*(yj-yi)-(y-yi)*(xj-xi);
    if(Math.abs(cross)<1e-12&&x>=Math.min(xi,xj)-1e-10&&x<=Math.max(xi,xj)+1e-10&&y>=Math.min(yi,yj)-1e-10&&y<=Math.max(yi,yj)+1e-10)return 0;
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside?1:-1;
}
export function geometryContains(point,geometry){
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
  return polygons.some(([outer,...holes])=>ringPosition(point,outer)>=0&&!holes.some(hole=>ringPosition(point,hole)>=0));
}
export function districtAt(lng,lat,districts=ASTANA_DISTRICTS){
  if(!Number.isFinite(lng)||!Number.isFinite(lat))return null;
  const matches=districts.features.filter(f=>geometryContains([lng,lat],f.geometry));
  return matches.length===1?matches[0]:null;
}
export function districtBounds(feature){
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  const points=polygons.flat(2);return [[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]];
}
// Label placement is separate from geometry: labels remain near the urban
// neighbourhoods instead of the remote airport/cemetery parts of the polygons.
const LABEL_ANCHORS={saryarka:[71.28,51.22],baikonyr:[71.49,51.225],almaty:[71.57,51.18],sarayshyk:[71.575,51.115],esil:[71.47,51.075],nura:[71.30,51.13]};
export function districtLabelPoint(feature){
  const anchor=LABEL_ANCHORS[feature.properties.id];if(anchor&&geometryContains(anchor,feature.geometry))return anchor;
  const [[west,south],[east,north]]=districtBounds(feature);let best,score=Infinity;
  for(let ix=1;ix<40;ix++)for(let iy=1;iy<40;iy++){const p=[west+(east-west)*ix/40,south+(north-south)*iy/40];if(geometryContains(p,feature.geometry)){const d=(p[0]-71.45)**2+(p[1]-51.15)**2;if(d<score){best=p;score=d;}}}
  if(!best)throw new Error('Cannot place district label inside boundary.');return best;
}
export function districtSummary(data,metric='pm2_5',districts=ASTANA_DISTRICTS){
  const summaries=districts.features.map(feature=>({id:feature.properties.id,name:feature.properties.name,feature,stations:[],values:[],count:0,mean:null,min:null,max:null,time:data?.time??null}));
  for(const station of data?.stations||[]){
    if(station.time!==data.time)continue;
    const feature=districtAt(station.lng,station.lat,districts),summary=summaries.find(d=>d.id===feature?.properties.id);if(!summary)continue;
    summary.stations.push(station);const value=station.values?.[metric];if(Number.isFinite(value)&&value>=0)summary.values.push(value);
  }
  for(const summary of summaries){summary.count=summary.values.length;if(summary.count){summary.mean=summary.values.reduce((a,b)=>a+b,0)/summary.count;summary.min=Math.min(...summary.values);summary.max=Math.max(...summary.values);}}
  return summaries;
}
export function districtFeatures(summaries,metric){
  return {type:'FeatureCollection',features:summaries.map(d=>({...d.feature,properties:{...d.feature.properties,color:airColor(d.mean,metric),measured:d.count>0,count:d.count,value:d.mean}}))};
}
