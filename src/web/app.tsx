// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {mountCockpit,type CockpitContext} from './cockpit/design-view.js';
import shell from './cockpit/shell.html';
import {fieldLabels,enumLabels,type Locale} from './i18n.ts';
import {readBusiness,writeBusiness,durableRequestKey,completeRequestKey,BusinessError} from './business-api.ts';
import {OperatingDialogContent,operatingText} from './operating-dialog.tsx';
import {enhanceMobileCockpit} from './cockpit/mobile-enhancements.js';
import {loadCockpitState,saveCockpitState} from './cockpit/state-storage.ts';
import {sameSupplyGoal} from './cockpit/supply-state.ts';
import {CustomerCaseContent,customerText} from './customer-case.tsx';
import type {CustomerCase} from '../core/customer-case.ts';
type Row=Record<string,any>;
const labels={
 ledger:['核对经营台账','Reconcile operating ledger','業務台帳を照合'],
 close:['返回业务环节','Back to process stage','業務工程へ戻る'],
 loading:['正在读取经营台账…','Loading operating ledger…','業務台帳を読み込み中…'],
 failed:['经营台账暂不可用，请稍后重试。','Operating ledger is unavailable. Please retry.','業務台帳は現在利用できません。再試行してください。'],
 retry:['重试','Retry','再試行'],
 denied:['当前身份无权查看此台账。','This account cannot view this ledger.','このアカウントでは台帳を閲覧できません。'],
 historic:['重点客户组合 · 2026年9月经营实绩','Key-account portfolio · September 2026 actuals','重点顧客群・2026年9月実績'],
 plan:['四SKU经营台账 · 2026.10.12起计划','Four-SKU ledger · plans from Oct12,2026','4SKU業務台帳・2026年10月12日以降の計画'],
 snapshot:['四SKU经营台账 · 2026.10.12经营时点','Four-SKU ledger · operating snapshot Oct12,2026','4SKU業務台帳・2026年10月12日時点'],
 unresolved:['待核实','Unverified','要確認'],
 table:['经营记录','Operating records','業務記録'],
 case:['关联经营事项','Related operating case','関連経営案件'],
 scope:['本台账固定业务期间，与上方区域/期间分析分别核对。','This ledger has its own business period; reconcile separately from the region/period analysis above.','本台帳の対象期間は固定です。上部の地域・期間分析とは分けて照合します。']
} satisfies Record<string,[string,string,string]>;
const columns:Record<string,string[]>={product_revision:['sku_id','bom_version','effective_from','approval_state'],demand_supply_bucket:['location_id','week_start','sku_id','demand_cases','supply_cases','consumed_order_cases'],supplier_delivery:['supplier_code','po_code','expected_qty','unit_code','promised_on','arrived_on'],stock_position_movement:['sku_id','lot_code','quality_state','opening_qty','receipts_qty','issues_qty','closing_qty','unit_code'],production_order:['order_code','sku_id','line_code','scheduled_hours','good_output_cases','fact_state'],logistics_line:['transfer_code','sku_id','from_site','to_site','shipped_cases','received_cases'],trade_line:['document_code','customer_code','primary_channel','quantity','unit_code','net_amount'],finance_entry_projection:['document_code','account_code','amount','entry_kind','recognized_on'],customer_lifecycle_snapshot:['snapshot_on','party_code','cohort_size','repeat_count','marketing_consent','unresolved_service_code'],store_asset_observation:['store_code','window_start','window_end','shelf_code','sku_id','traffic_count','stockout_minutes','device_online','temperature_c'],responsibility_capacity:['work_date','role_code','assignment_code','scheduled_hours','available_hours','aggregate_cost'],resource_commitment:['resource_code','capacity','reserved','unit_code','state']};
function text(key:keyof typeof labels,locale:Locale){return labels[key][{zh:0,en:1,ja:2}[locale]];}
function value(key:string,v:unknown,row:Row,locale:Locale){
 if(v===null||v===undefined)return text('unresolved',locale);
 const date=String(v),language={zh:'zh-CN',en:'en-US',ja:'ja-JP'}[locale];
 if(['window_start','window_end','bucket_start','bucket_end'].includes(key)&&Number.isFinite(Date.parse(date)))return new Intl.DateTimeFormat(language,{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(date));
 if(/(_on|_from|_to|_until|^week_start$|^cutoff$|^work_date$)/.test(key)&&/^\d{4}-\d{2}-\d{2}/.test(date))return date.slice(0,10);
 const sites:Record<string,[string,string,string]>={'DC-GUANGZHOU':['广州中央仓','Guangzhou DC','広州中央倉庫'],'DC-HANGZHOU':['杭州中央仓','Hangzhou DC','杭州中央倉庫'],'DC-WUHAN':['武汉中央仓','Wuhan DC','武漢中央倉庫'],'DC-TIANJIN':['天津中央仓','Tianjin DC','天津中央倉庫'],'DC-CHENGDU':['成都中央仓','Chengdu DC','成都中央倉庫']};
 if(sites[date])return sites[date][{zh:0,en:1,ja:2}[locale]];
 const n=(x:number)=>new Intl.NumberFormat({zh:'zh-CN',en:'en-US',ja:'ja-JP'}[locale],{maximumFractionDigits:2}).format(x);
 if(key.endsWith('_cases')||['net_amount','tax_amount','amount','aggregate_cost'].includes(key)||(/_qty$|^quantity$/.test(key)&&row.unit_code==='sales_case'))return n(Number(v)/10000);
 if(key==='unit_code'&&v==='sales_case')return {zh:'万箱',en:'10k cases',ja:'万ケース'}[locale];
 if(typeof v==='boolean')return locale==='zh'?(v?'是':'否'):locale==='ja'?(v?'はい':'いいえ'):(v?'Yes':'No');
 return enumLabels[String(v)]?.[{zh:0,en:1,ja:2}[locale]]??String(v);
}
function App(){
 const host=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),returnFocus=useRef<HTMLButtonElement|null>(null),request=useRef(0);
 const [selection,setSelection]=useState<CockpitContext|null>(null),[report,setReport]=useState<Row|null>(null),[error,setError]=useState<string|null>(null);
 const [model,setModel]=useState<Row|null>(null),[bootError,setBootError]=useState(false),[context,setContext]=useState<CockpitContext|null>(null);
 const [work,setWork]=useState<{kind:string;selection:Row;record:Row|null;error:string|null}|null>(null),[busy,setBusy]=useState(false);
 const customerDialog=useRef<HTMLDialogElement>(null),customerSequence=useRef(0);const [customerCase,setCustomerCase]=useState<{record:CustomerCase|null;error:string|null;busy:boolean}|null>(null);
 async function loadCustomers(){const sequence=++customerSequence.current;setCustomerCase(current=>({record:current?.record??null,error:null,busy:true}));try{const record=await readBusiness('/v1/customer-case');if(sequence===customerSequence.current)setCustomerCase({record,error:null,busy:false});}catch(e){if(sequence===customerSequence.current)setCustomerCase({record:null,error:e instanceof BusinessError&&[401,403].includes(e.status)?'denied':'unavailable',busy:false});}}
 function closeCustomers(){++customerSequence.current;customerDialog.current?.close();setCustomerCase(null);const target=returnFocus.current?.isConnected?returnFocus.current:host.current?.querySelector<HTMLButtonElement>('[data-customer-case]');target?.focus({preventScroll:true});}
 useEffect(()=>{if(customerCase&&!customerDialog.current?.open)customerDialog.current?.showModal();},[customerCase]);
 const workflowDialog=useRef<HTMLDialogElement>(null),view=useRef<ReturnType<typeof mountCockpit>|null>(null),liveCases=useRef<Row|null>(null),activeSupply=useRef<string|null>(null),workflowSequence=useRef(0),busyRef=useRef(false),workRef=useRef(work),contextRef=useRef(context);workRef.current=work;contextRef.current=context;
 async function loadModel(){setBootError(false);try{setModel((await readBusiness('/v1/operating/snapshot')).snapshot);}catch{setBootError(true);}}
 useEffect(()=>{void loadModel();},[]);
 function businessError(e:unknown){return e instanceof BusinessError&&[401,403].includes(e.status)?'denied':e instanceof BusinessError&&e.status===409?'conflict':'error';}
 async function readSupplyRun(id:string){const record=await readBusiness('/v1/runs/'+id);let cursor=0,events:Row[]=[],historyTruncated=false;for(let page=0;page<10;page++){const log=await readBusiness('/v1/runs/'+id+'/events?after_sequence='+cursor);events.push(...log.events);cursor=log.nextCursor;if(log.events.length<100)break;if(page===9)historyTruncated=true;}return {...record,events,historyTruncated};}
 async function refreshCases(){try{const list=await readBusiness('/v1/operating/cases');const run=list.supply.find((r:Row)=>r.id===activeSupply.current)??list.supply[0];if(run)activeSupply.current=run.id;liveCases.current={...list,run:run?await readSupplyRun(run.id):null};view.current?.navigate({});}catch{/* Keep unavailable data unverified. / 暂不可用数据不冒充已核实。 */}}
 async function openWork(kind:string,state:Row={},reassess=false){const sequence=++workflowSequence.current;const selected=kind==='quality'?{kind:'quality',code:'CAP-IN-001',at:'2026-10-12T12:00:00+08:00'}:kind==='store'?{kind:'store',store:'GZ-018',shelf:state.shelf??contextRef.current?.shelf??8,period:state.period??contextRef.current?.period??'evening'}:{kind:'supply',cashBudgetCny:state.cashBudgetCny??(state.networkBudget??6000)*10000,planVariant:state.planVariant??state.networkPlan??'balanced',copackAllowed:state.copackAllowed??state.networkQualified??true};
  setWork({kind,selection:selected,record:null,error:null});if(['payment','outcome'].includes(kind))return;setBusy(true);busyRef.current=true;
  const operation=kind+'-'+JSON.stringify(selected);try{const list=await readBusiness('/v1/operating/cases');let record:Row;
   const existing=kind==='supply'?list.supply[0]:list.reviews.find((r:Row)=>r.kind===kind&&JSON.stringify(Object.entries(r.selection).sort())===JSON.stringify(Object.entries(selected).sort()));
   const existingSupply=kind==='supply'&&existing?await readSupplyRun(existing.id):null;
   if(existing&&!reassess&&(kind!=='supply'||sameSupplyGoal(existingSupply.goal,selected as any)))record=kind==='supply'?existingSupply:await readBusiness('/v1/operating/cases/'+existing.id);
   else if(kind==='supply'){const run=await writeBusiness('/v1/cases/SUPPLY-20261012/runs',selected,durableRequestKey(operation));record=await readSupplyRun(run.runId);completeRequestKey(operation);}
   else{record=await writeBusiness('/v1/operating/cases',selected,durableRequestKey(operation));completeRequestKey(operation);}
   if(sequence===workflowSequence.current){if(kind==='supply')activeSupply.current=record.id;setWork({kind,selection:selected,record,error:null});}await refreshCases();
  }catch(e){if(sequence===workflowSequence.current)setWork({kind,selection:selected,record:null,error:businessError(e)});}finally{if(sequence===workflowSequence.current){setBusy(false);busyRef.current=false;}}
 }
 async function workAction(operation:'approve'|'reconcile'){const current=workRef.current;if(!current||busyRef.current)return;const sequence=workflowSequence.current;if(!current.record){void openWork(current.kind,current.selection);return;}setBusy(true);busyRef.current=true;try{const {record,kind}=current;if(operation==='approve'){if(kind==='supply')await writeBusiness('/v1/plans/'+record.plans.at(-1).id+'/approvals',{expected_version:record.plans.at(-1).version,decision:'approve'});else await writeBusiness('/v1/operating/cases/'+record.id+'/approve',{expectedVersion:record.version});}else await writeBusiness(kind==='supply'?'/v1/runs/'+record.id+'/reconcile':'/v1/operating/cases/'+record.id+'/reconcile',{});const updated=await (kind==='supply'?readSupplyRun(record.id):readBusiness('/v1/operating/cases/'+record.id));if(sequence===workflowSequence.current)setWork({...current,record:updated,error:null});await refreshCases();}catch(e){if(sequence===workflowSequence.current)setWork({...current,error:businessError(e)});}finally{if(sequence===workflowSequence.current){setBusy(false);busyRef.current=false;}}}
 async function fulfillReference(){const current=workRef.current;if(!current?.record||current.kind!=='supply'||busyRef.current)return;const sequence=workflowSequence.current;busyRef.current=true;setBusy(true);try{await writeBusiness('/v1/dev/runtime/'+current.record.id+'/fulfill',{});const record=await readSupplyRun(current.record.id);if(sequence===workflowSequence.current)setWork({...current,record,error:null});await refreshCases();}catch(e){if(sequence===workflowSequence.current)setWork({...current,error:businessError(e)});}finally{if(sequence===workflowSequence.current){busyRef.current=false;setBusy(false);}}}
 useEffect(()=>{if(work&&!workflowDialog.current?.open)workflowDialog.current?.showModal();},[work]);
 useEffect(()=>{const timer=setInterval(()=>{const current=workRef.current;if(!current?.record||busyRef.current||document.hidden||!['ready','running','waiting_external'].includes(current.record.state))return;const id=current.record.id;void (current.kind==='supply'?readSupplyRun(id):readBusiness('/v1/operating/cases/'+id)).then(record=>{if(workRef.current?.record?.id===id)setWork(w=>w?{...w,record}:w);return refreshCases();}).catch(()=>{if(workRef.current?.record?.id===id)setWork(w=>w?{...w,error:'error'}:w);});},2000);return()=>clearInterval(timer);},[]);
 function closeWork(){const kind=workRef.current?.kind;++workflowSequence.current;workflowDialog.current?.close();setWork(null);busyRef.current=false;setBusy(false);if(returnFocus.current?.isConnected)returnFocus.current.focus({preventScroll:true});else host.current?.querySelector<HTMLElement>(`[data-workflow-kind="${kind}"]`)?.focus({preventScroll:true});}
 const locale=selection?.lang??'zh';
 async function load(context:CockpitContext){
  const id=++request.current;setReport(null);setError(null);setSelection(context);
  try {const response=await fetch(`/v1/processes/${context.domain}/stages/${context.domain}-${context.step+1}`,{credentials:'same-origin'});if(!response.ok)throw Error(response.status===401||response.status===403?'denied':'failed');const result=await response.json();if(id===request.current)setReport(result);}
  catch(e){if(id===request.current)setError((e as Error).message);}
 }
 useEffect(()=>{
  if(!model)return;
  const root=host.current!;root.innerHTML=shell;
  let origin:{key:string;value:string}|null=null;
  // Approved design is a view module; SQL records are read through a separate port.
  // 已批准设计作为视图模块，SQL台账通过独立接口读取。
  const onClick=(event:MouseEvent)=>{const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button)return;
   if(button.hasAttribute('data-domain'))origin={key:'data-domain',value:button.dataset.domain!};
   const entering=button.hasAttribute('data-domain')||button.hasAttribute('data-step');
   const returning=button.dataset.page==='business'&&Boolean(button.closest('.bc-breadcrumb'));
   // Wait until all native view listeners have rendered the new page.
   // 等原视图全部事件监听完成渲染后再安排焦点。
   requestAnimationFrame(()=>{
    if(entering){const heading=root.querySelector<HTMLElement>('.v8-domain-action h2');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});}
    else if(returning&&origin)root.querySelector<HTMLElement>(`[${origin.key}="${origin.value}"]`)?.focus({preventScroll:true});
   });
  };
  root.addEventListener('click',onClick,true);
  view.current=mountCockpit(root,{
   data:model,
   supplyStatus:()=>liveCases.current,
   onAction:action=>{returnFocus.current=document.activeElement as HTMLButtonElement;void openWork(action.kind==='reconcile'?'supply':action.kind,action.state);},
   loadState:()=>{try{return loadCockpitState(localStorage);}catch{return null;}},
   saveState:state=>{try{saveCockpitState(localStorage,state);}catch{}},
   onRender:context=>{
    enhanceMobileCockpit(root,context.lang);
    contextRef.current=context;setContext(context);
    root.dataset.viewContract='v0.11';
    if(context.domain){
     const toolbar=root.querySelector('.v8-records .bc-row');
     const button=document.createElement('button');button.type='button';button.dataset.ledger=`${context.domain}-${context.step+1}`;button.textContent=text('ledger',context.lang);
     button.addEventListener('click',()=>{returnFocus.current=button;void load(context);});toolbar?.append(button);
     const review=document.createElement('button');review.type='button';review.dataset.runtimeEntry='';review.textContent=operatingText('title',context.lang);review.addEventListener('click',()=>{returnFocus.current=review;void openWork(['quality','product','supplier','crm'].includes(context.domain!)?'quality':context.domain==='marketing'?'store':'supply',context);});toolbar?.append(review);
     root.querySelector<HTMLElement>('.v8-domain-action h2')?.setAttribute('tabindex','-1');
    }
    if(context.page==='customers'&&!context.domain||context.domain==='crm'){const entry=document.createElement('button');entry.type='button';entry.dataset.customerCase='';entry.textContent=customerText('title',context.lang);entry.addEventListener('click',()=>{returnFocus.current=entry;void loadCustomers();});if(context.domain)root.querySelector('.v8-records .bc-row')?.append(entry);else{const wrap=document.createElement('div');wrap.className='workflow-entrances';wrap.append(entry);root.querySelector('.bc-heading')?.insertAdjacentElement('afterend',wrap);}}
    const supply=liveCases.current?.run;if(supply){const card=root.querySelector('.v10-case-strip');const target=card?.querySelector('[data-v7-network="open"]')?card.querySelector('strong'):null;if(target){const received=supply.actions.filter((a:Row)=>a.commit_state==='committed'&&supply.obligations.some((o:Row)=>o.action_id===a.id&&o.state==='closed')).reduce((sum:number,a:Row)=>sum+a.args.lines.reduce((n:number,l:Row)=>n+l.quantity,0),0);target.textContent=String(Math.max(0,160-received/10000));}}
    if(['coordination','store','customers','business'].includes(context.page)&&!context.domain){const wrap=document.createElement('div');wrap.dataset.runtimeEntry='';wrap.className='workflow-entrances';for(const kind of ['supply','quality','store']){const entry=document.createElement('button');entry.type='button';entry.dataset.workflowKind=kind;entry.textContent=operatingText(kind,context.lang);entry.addEventListener('click',()=>{returnFocus.current=entry;void openWork(kind,context);});wrap.append(entry);}const heading=root.querySelector('.bc-heading');heading?.insertAdjacentElement('afterend',wrap);}
    const storeEntry=root.querySelector<HTMLElement>('[data-v10-assess]');if(context.page==='store'&&storeEntry){const shortcut=document.createElement('button');shortcut.type='button';shortcut.dataset.runtimeEntry='';shortcut.textContent=operatingText('title',context.lang);shortcut.addEventListener('click',()=>{returnFocus.current=shortcut;void openWork('store',context);});root.querySelector('.v10-selection')?.append(shortcut);}
   }
  });
  void refreshCases();
  return()=>root.removeEventListener('click',onClick,true);
 },[model]);
 useEffect(()=>{if(selection&&!dialog.current?.open)dialog.current?.showModal();},[selection]);
 function close(){++request.current;dialog.current?.close();setSelection(null);setReport(null);setError(null);returnFocus.current?.focus({preventScroll:true});}
 return <>{!model&&<section className="workflow-boot" role="status">{bootError?'经营全景暂不可用 / Operating view unavailable / 経営画面を利用できません':'正在载入经营全景 / Loading operations / 経営画面を読込中'}{bootError&&<button onClick={()=>void loadModel()}>重新载入 / Reload / 再読込</button>}</section>}<div id="beverage-enterprise-cockpit" ref={host} aria-label="企业经营驾驶舱 / Enterprise cockpit"/>
 <dialog className="workflow-dialog" ref={workflowDialog} onCancel={e=>{e.preventDefault();closeWork();}} aria-labelledby="workflow-title"><div className="ledger-top"><h2 id="workflow-title">{operatingText('title',context?.lang??'zh')}</h2><button autoFocus onClick={closeWork} aria-label={operatingText('close',context?.lang??'zh')}>×</button></div>{work&&<OperatingDialogContent locale={context?.lang??'zh'} kind={work.kind} record={work.record} error={work.error} busy={busy} onApprove={()=>void workAction('approve')} onReconcile={()=>void workAction('reconcile')} onReassess={()=>void openWork(work.kind,work.selection,true)} onFulfill={()=>void fulfillReference()}/>}<div className="ledger-bottom"><button onClick={closeWork}>{operatingText('close',context?.lang??'zh')}</button></div></dialog>
 <dialog className="customer-case-dialog" ref={customerDialog} onCancel={e=>{e.preventDefault();closeCustomers();}} aria-labelledby="customer-case-title"><div className="ledger-top"><h2 id="customer-case-title">{customerText('title',context?.lang??'zh')}</h2><button autoFocus onClick={closeCustomers} aria-label={customerText('close',context?.lang??'zh')}>×</button></div>{customerCase&&<CustomerCaseContent locale={context?.lang??'zh'} record={customerCase.record} error={customerCase.error} busy={customerCase.busy} onRefresh={()=>void loadCustomers()}/>}<div className="ledger-bottom"><button onClick={closeCustomers}>{customerText('close',context?.lang??'zh')}</button></div></dialog>
 <dialog className="ledger-dialog" ref={dialog} onCancel={e=>{e.preventDefault();close();}} aria-labelledby="ledger-heading">
  <div className="ledger-top"><div><span>{text('table',locale)}</span><h2 id="ledger-heading">{report?.definition?.title?.[locale]??text('ledger',locale)}</h2></div><button autoFocus onClick={close} aria-label={text('close',locale)}>×</button></div>
  {report?<><p className="ledger-context">{text(report.context.historical?'historic':report.records.every((r:Row)=>r.fact_kind==='scenario_plan')?'plan':'snapshot',locale)}</p><p className="ledger-scope">{text('scope',locale)}</p><div className="ledger-table" tabIndex={0}><table><thead><tr>{columns[report.definition.projection_kind].map(k=><th key={k}>{fieldLabels[k]?.[{zh:0,en:1,ja:2}[locale]]??k}</th>)}</tr></thead><tbody>{report.records.map((row:Row,i:number)=><tr key={i}>{columns[report.definition.projection_kind].map(k=><td key={k}>{value(k,row[k],row,locale)}</td>)}</tr>)}</tbody></table></div><p className="ledger-case">{text('case',locale)} · {report.context.caseId}</p></>:<div className="ledger-status" role="status">{text(error==='denied'?'denied':error?'failed':'loading',locale)}{error==='failed'&&<button onClick={()=>selection&&void load(selection)}>{text('retry',locale)}</button>}</div>}
  <div className="ledger-bottom"><button onClick={close}>{text('close',locale)}</button></div>
 </dialog></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
