// Preserve the preceding selection while giving v0.11 its own storage key.
// 保留旧版选择，v0.11使用独立存储键；存储不可用不阻断业务导航。
type StoredState=Record<string,unknown>;
type StateStorage={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
export const cockpitStateKey='cockpit-v11';
const previousKey='cockpit-v10';
export function loadCockpitState(storage:StateStorage):StoredState|null{
 for(const name of [cockpitStateKey,previousKey]){
  try{
   const text=storage.getItem(name);if(!text)continue;
   const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))continue;
   const version=value.designVersion;
   if(name===cockpitStateKey?version!=='0.11':version!==undefined&&!['0.7','0.8','0.9','0.10'].includes(version))continue;
   return value;
  }catch{/* Leave corrupt or blocked storage untouched. / 不改写损坏或被禁用的存储。 */}
 }
 return null;
}
export function saveCockpitState(storage:StateStorage,state:StoredState):boolean{
 try{storage.setItem(cockpitStateKey,JSON.stringify({...state,designVersion:'0.11'}));return true;}
 catch{return false;}
}
