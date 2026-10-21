let database;
function db(){return database??=new Promise((resolve,reject)=>{const request=indexedDB.open('ecomind-photos',1);request.onupgradeneeded=()=>request.result.createObjectStore('photos');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Браузер не разрешил сохранить фотографию.'));});}
export async function savePhoto(file){
  if(!file)return null;if(file.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Фото: JPEG, PNG или WebP до 10 МБ.');
  const image=await createImageBitmap(file);if(image.width*image.height>45000000){image.close();throw new Error('Слишком большое разрешение фотографии.');}
  const scale=Math.min(1,1280/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));if(!blob)throw new Error('Не удалось обработать фотографию.');
  const id=crypto.randomUUID(),store=(await db()).transaction('photos','readwrite');store.objectStore('photos').put(blob,id);await new Promise((resolve,reject)=>{store.oncomplete=resolve;store.onerror=()=>reject(new Error('Не удалось сохранить фотографию.'));});return id;
}
export async function getPhoto(id){const request=(await db()).transaction('photos').objectStore('photos').get(id);return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result||null);request.onerror=reject;});}
