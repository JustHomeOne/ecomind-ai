import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const url='https://gis.esaulet.kz/server/rest/services/Hosted/raiony/FeatureServer/0/query?where=1%3D1&outFields=objectid%2Cname%2Cname_object%2Cname_object_kaz&outSR=4326&geometryPrecision=6&f=geojson';
const fileIndex=process.argv.indexOf('--file');
const text=fileIndex>=0?await readFile(process.argv[fileIndex+1],'utf8'):await (await fetch(url,{signal:AbortSignal.timeout(30000)})).text();
const raw=JSON.parse(text),ids={3:'saryarka',4:'baikonyr',11:'sarayshyk',7:'esil',13:'almaty',9:'nura'};
if(raw.type!=='FeatureCollection'||raw.features?.length!==6)throw new Error('Expected exactly six official districts.');
const features=raw.features.map(f=>{
  const id=ids[f.properties.objectid];if(!id||!['Polygon','MultiPolygon'].includes(f.geometry?.type))throw new Error('Unexpected district or geometry.');
  const polygon=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const rings of polygon)for(const ring of rings){if(ring.length<4)throw new Error('Invalid ring.');for(const point of ring){if(point[0]<71||point[0]>72||point[1]<50.7||point[1]>51.5)throw new Error('Coordinates are not WGS84 Astana.');}}
  const rounded=JSON.parse(JSON.stringify(f.geometry.coordinates,(_,value)=>typeof value==='number'?Math.round(value*1e6)/1e6:value));
  return {type:'Feature',id,properties:{id,objectId:f.properties.objectid,name:f.properties.name_object_kaz||f.properties.name_object,nameRu:f.properties.name_object},geometry:{type:f.geometry.type,coordinates:rounded}};
});
if(new Set(features.map(f=>f.id)).size!==6)throw new Error('Duplicate district.');
const meta={source:'Геоинформационный центр города Астаны',url,retrievedAt:new Date().toISOString(),sourceSha256:createHash('sha256').update(text).digest('hex'),note:'Публичный картографический слой; дата актуализации геометрии источником не указана. Координаты округлены до 6 знаков.'};
await writeFile('dist/astana-districts-data.js','// Public city geoportal snapshot. Regenerate with scripts/update-districts.mjs.\nexport const DISTRICT_SOURCE='+JSON.stringify(meta)+';\nexport const ASTANA_DISTRICTS='+JSON.stringify({type:'FeatureCollection',features})+';\n');
console.log('Bundled six city districts, source SHA256 '+meta.sourceSha256);
