export function createVisitScope({owner=false,guest=false,storage}={}){
  const isOwner=owner===true&&!guest;
  if(isOwner&&storage?.getItem&&storage?.setItem)return Object.freeze({owner:true,storage});
  const values=new Map();
  const temporary={temporary:true,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  return Object.freeze({owner:isOwner,id:globalThis.crypto.randomUUID(),storage:temporary});
}
