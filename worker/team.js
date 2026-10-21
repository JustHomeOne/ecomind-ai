import {emptyOps,validateSnapshot,applyOperation} from '../dist/operations.js';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function body(request,max=2*1024*1024){
  if(!request.headers.get('content-type')?.includes('application/json'))throw new Error('Ожидается JSON.');
  const reader=request.body?.getReader();if(!reader)throw new Error('Пустой запрос.');let bytes=0,text='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max){await reader.cancel();throw new Error('Запрос слишком большой.');}text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode());
}
export async function teamAPI(request,env){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!env.DB)return response({error:'Общая база доступна в облачной версии EcoMind.'},503);
  const userId=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email')?.toLowerCase();
  if(!userId||!email)return response({error:'Войдите через ChatGPT, чтобы открыть командное пространство.',signin:'/signin-with-chatgpt?return_to=%2F%23team'},401);
  if(!['GET','HEAD'].includes(method)&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return response({error:'Недопустимый источник запроса.'},403);
  const db=env.DB,now=new Date().toISOString();
  try{
    if(path==='/api/team/workspaces'&&method==='GET'){
      const spaces=await db.prepare('SELECT w.id,w.name,w.revision,m.role FROM workspaces w JOIN members m ON w.id=m.workspace_id WHERE m.user_id=? ORDER BY w.created_at').bind(userId).all();
      const invitations=await db.prepare('SELECT i.id,i.role,w.name FROM invites i JOIN workspaces w ON w.id=i.workspace_id WHERE i.email=? AND i.expires_at>?').bind(email,now).all();
      return response({user:{id:userId,email},spaces:spaces.results,invitations:invitations.results});
    }
    if(path==='/api/team/workspaces'&&method==='POST'){
      const input=await body(request),id=crypto.randomUUID(),name=String(input.name||'Мой квартал').trim().slice(0,80);
      const count=await db.prepare('SELECT COUNT(*) AS count FROM workspaces WHERE owner_id=?').bind(userId).first();if(count.count>=10)return response({error:'Доступно до 10 пространств.'},400);
      await db.batch([db.prepare('INSERT INTO workspaces (id,owner_id,name,payload,revision,created_at,updated_at) VALUES (?,?,?,?,0,?,?)').bind(id,userId,name,JSON.stringify(emptyOps([])),now,now),db.prepare('INSERT INTO members (workspace_id,user_id,email,role) VALUES (?,?,?,?)').bind(id,userId,email,'owner')]);return response({id},201);
    }
    if(path==='/api/team/join'&&method==='POST'){
      const input=await body(request),invite=await db.prepare('SELECT * FROM invites WHERE id=? AND email=? AND expires_at>?').bind(input.inviteId,email,now).first();
      if(!invite)return response({error:'Приглашение не найдено или истекло.'},404);
      await db.batch([db.prepare('INSERT OR IGNORE INTO members (workspace_id,user_id,email,role) VALUES (?,?,?,?)').bind(invite.workspace_id,userId,email,invite.role),db.prepare('DELETE FROM invites WHERE id=?').bind(invite.id)]);return response({id:invite.workspace_id});
    }
    const match=path.match(/^\/api\/team\/workspaces\/([a-zA-Z0-9-]+)(?:\/(changes|members|invites|photos)(?:\/([a-zA-Z0-9-]+))?)?$/);if(!match)return response({error:'Неизвестный адрес API.'},404);
    const [,id,section,itemId]=match,member=await db.prepare('SELECT role FROM members WHERE workspace_id=? AND user_id=?').bind(id,userId).first();if(!member)return response({error:'Нет доступа к этому пространству.'},403);
    const workspace=await db.prepare('SELECT * FROM workspaces WHERE id=?').bind(id).first();if(!workspace)return response({error:'Пространство не найдено.'},404);
    if(!section&&method==='GET')return response({id,name:workspace.name,revision:workspace.revision,role:member.role,snapshot:JSON.parse(workspace.payload)});
    if(section==='changes'&&method==='POST'){
      if(member.role==='viewer')return response({error:'Наблюдателю доступно только чтение.'},403);
      const input=await body(request);if(input.baseRevision!==workspace.revision)return response({error:'Данные изменены другим участником. Обновите пространство и повторите действие.'},409);
      if(member.role==='driver'&&!['observe','service'].includes(input.op?.type))return response({error:'Это действие доступно диспетчеру.'},403);
      const snapshot=applyOperation(validateSnapshot(JSON.parse(workspace.payload)),input.op,{now,actor:email,role:member.role});
      const update=await db.prepare('UPDATE workspaces SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(JSON.stringify(snapshot),now,id,workspace.revision).run();
      if(update.meta.changes!==1)return response({error:'Данные изменились во время сохранения. Обновите пространство.'},409);
      return response({revision:workspace.revision+1,snapshot});
    }
    if(section==='members'&&method==='GET'){
      const members=await db.prepare('SELECT user_id,email,role FROM members WHERE workspace_id=?').bind(id).all();
      const invites=member.role==='owner'?(await db.prepare('SELECT id,email,role,expires_at FROM invites WHERE workspace_id=?').bind(id).all()).results:[];
      return response({members:members.results,invites});
    }
    if((section==='members'||section==='invites')&&member.role!=='owner')return response({error:'Участниками управляет владелец.'},403);
    if(section==='invites'&&method==='POST'){
      const input=await body(request),inviteEmail=String(input.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)||!['dispatcher','driver','viewer'].includes(input.role))throw new Error('Проверьте email и роль.');
      await db.prepare('INSERT INTO invites (id,workspace_id,email,role,expires_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,inviteEmail,input.role,new Date(Date.now()+7*86400000).toISOString()).run();return response({ok:true});
    }
    if(section==='members'&&itemId&&method==='DELETE'){
      const target=await db.prepare('SELECT role FROM members WHERE workspace_id=? AND user_id=?').bind(id,itemId).first();if(target?.role==='owner')throw new Error('Владельца нельзя удалить.');await db.prepare('DELETE FROM members WHERE workspace_id=? AND user_id=?').bind(id,itemId).run();return response({ok:true});
    }
    if(section==='invites'&&itemId&&method==='DELETE'){await db.prepare('DELETE FROM invites WHERE workspace_id=? AND id=?').bind(id,itemId).run();return response({ok:true});}
    if(section==='photos'&&itemId){
      if(!env.BUCKET)return response({error:'Хранилище фото пока недоступно.'},503);
      const key=`${id}/${itemId}.jpg`;
      if(method==='GET'){const photo=await env.BUCKET.get(key);return photo?new Response(photo.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private,max-age=300','X-Content-Type-Options':'nosniff'}}):response({error:'Фото не найдено.'},404);}
      if(method==='PUT'){
        if(member.role==='viewer')return response({error:'Наблюдатель не может загружать фото.'},403);
        if(request.headers.get('content-type')!=='image/jpeg')throw new Error('Ожидается JPEG.');
        const stream=request.body?.getReader();if(!stream)throw new Error('Пустое фото.');let count=0,chunks=[];
        while(true){const {done,value}=await stream.read();if(done)break;count+=value.byteLength;if(count>2*1024*1024){await stream.cancel();return response({error:'Файл превышает 2 МБ.'},413);}chunks.push(value);}
        const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new Error('Некорректный JPEG.');
        await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});return response({ok:true});
      }
    }
    return response({error:'Метод не поддерживается.'},405);
  }catch(e){return response({error:e.message||'Не удалось сохранить данные.'},400);}
}
