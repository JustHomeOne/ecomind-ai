import {validateContainer} from './operations.js';
const aliases={id:['id','код'],name:['name','название','площадка'],address:['address','адрес'],lat:['lat','latitude','широта'],lng:['lng','lon','longitude','долгота'],capacity:['capacity','вместимость','вместимость л'],fill:['fill','заполненность','заполненность %'],type:['type','тип','тип отходов'],mandatory:['mandatory','обязательный вывоз']};
export function rowsToContainers(rows){
  if(!Array.isArray(rows)||rows.length<2||rows.length>1000)throw new Error('В таблице нужны заголовок и от 1 до 39 площадок.');
  const headers=rows[0].map(v=>String(v??'').trim().toLocaleLowerCase('ru')),index={};for(const [key,names] of Object.entries(aliases))index[key]=headers.findIndex(h=>names.includes(h));
  for(const key of ['id','name','lat','lng','capacity'])if(index[key]<0)throw new Error(`Нет обязательного столбца ${key}. Скачайте шаблон.`);
  const num=v=>v===null||v===undefined||String(v).trim()===''?null:Number(String(v).replace(',','.').trim());
  const errors=[],containers=[],ids=new Set();
  rows.slice(1).filter(row=>row.some(v=>String(v??'').trim())).forEach((row,i)=>{try{const get=key=>row[index[key]],id=String(get('id')??'').trim();if(ids.has(id))throw new Error('ID повторяется');ids.add(id);containers.push(validateContainer({id,name:get('name'),address:get('address'),lat:num(get('lat')),lng:num(get('lng')),capacity:num(get('capacity')),fill:num(get('fill')),type:get('type')||'Смешанные',mandatory:['1','true','да'].includes(String(get('mandatory')).toLowerCase()),source:'verified',locationSource:'real',confidence:'medium'}));}catch(e){errors.push(`Строка ${i+2}: ${e.message}`);}});
  if(containers.length>39)errors.push('В пилоте поддерживается до 39 площадок.');if(!containers.length)errors.push('Нет корректных площадок.');return {containers,errors};
}
let library;
async function sheetJS(){if(window.XLSX)return window.XLSX;if(!library)library=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./sheetjs.js',import.meta.url).href;script.onload=()=>resolve(window.XLSX);script.onerror=()=>{library=null;reject(new Error('Не удалось загрузить обработчик таблиц.'));};document.head.append(script);});return library;}
export async function readImport(file){
  if(!file||file.size>5*1024*1024)throw new Error('Выберите CSV или Excel до 5 МБ.');
  if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw new Error('Поддерживаются CSV, XLSX и XLS.');
  const xlsx=await sheetJS(),workbook=xlsx.read(await file.arrayBuffer(),{type:'array',cellFormula:false,cellHTML:false,cellText:false,sheetRows:1001});
  if(!workbook.SheetNames.length)throw new Error('В файле нет листов.');
  return {...rowsToContainers(xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1,defval:null,raw:true})),sheet:workbook.SheetNames[0]};
}
