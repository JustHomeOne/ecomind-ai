import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {teamAPI} from '../worker/team.js';
import {localStorageBindings} from './local-storage.mjs';
const bindings=localStorageBindings();
const root=resolve('dist'), port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/__preview'){
      const requested=Number(new URL(req.url,'http://localhost').searchParams.get('width'));
      const width=[390,768,1440].includes(requested)?requested:1440;
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      return res.end(`<!doctype html><html><head><title>EcoMind · ${width}px preview</title><style>*{box-sizing:border-box}body{margin:0;width:${width}px;min-width:${width}px}iframe{display:block;width:${width}px;height:1100px;border:0}</style></head><body><iframe title="EcoMind preview" src="/"></iframe></body></html>`);
    }
    if(pathname.startsWith('/api/team/')){
      const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value)headers.set(name,Array.isArray(value)?value.join(','):value);
      headers.set('oai-authenticated-user-id','local-preview-owner');headers.set('oai-authenticated-user-email','preview@ecomind.local');
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024+1024){res.writeHead(413);return res.end('Too large');}chunks.push(chunk);}
      const response=await teamAPI(new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),bindings);
      res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if(pathname==='/api/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({status:'ok',gemini_configured:false,team_configured:true,preview:true}));}
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(file!==root && !file.startsWith(root+sep)) {res.writeHead(403);return res.end();}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
