// Deterministic units, partitions and reconciliations. / 确定性单位、范围和勾稽。
export type QueryContext = {enterpriseId:string;scopeId:string;scopeVersion:number;periodStart:string;periodEnd:string;factKind:string;factVersion:string;scenarioId:string;definitionVersion:number;unit:string;currency:string|null};
export function assertCompatible(a:QueryContext,b:QueryContext) {
  for(const key of Object.keys(a) as (keyof QueryContext)[]) if(a[key]!==b[key]) throw new Error(`context_mismatch:${key}`);
}
export function partition(parent:string[],children:string[][]) {
  const members=children.flat();
  if(new Set(members).size!==members.length || members.length!==parent.length || !parent.every(p=>members.includes(p)))throw new Error('invalid_partition');
  return true;
}
export function litresPerCase(volumeMl:number,unitsPerCase:number) {
  if(!Number.isSafeInteger(volumeMl)||volumeMl<=0||!Number.isSafeInteger(unitsPerCase)||unitsPerCase<=0)throw new Error('invalid_pack');
  return volumeMl*unitsPerCase/1000;
}
export function pooledRatio(groups:{numerator:number|null;denominator:number|null}[]) {
  if(groups.some(g=>g.numerator===null||g.denominator===null))return {value:null,status:'missing'};
  const numerator=groups.reduce((a,g)=>a+g.numerator!,0),denominator=groups.reduce((a,g)=>a+g.denominator!,0);
  if(groups.some(g=>g.numerator!<0||g.denominator!<0||g.numerator!>g.denominator!))throw new Error('invalid_ratio');
  return {numerator,denominator,value:denominator===0?null:numerator/denominator,status:denominator===0?'undefined':'known'};
}
export function closeStock(opening:bigint,receipts:bigint,issues:bigint,adjustments=0n) {return opening+receipts-issues+adjustments;}
export function moneyMinor(s:string):bigint {
  if(!/^-?\d+(\.\d{1,2})?$/.test(s))throw new Error('invalid_money');
  const negative=s.startsWith('-'),[whole,fraction='']=s.replace('-','').split('.');
  const minor=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));return negative?-minor:minor;
}
export function stockTotal(rows:{quantity:bigint;identity:string}[]) {
  if(new Set(rows.map(r=>r.identity)).size!==rows.length)throw new Error('duplicate_stock_identity');
  return rows.reduce((a,r)=>a+r.quantity,0n);
}
export function financialFeasibility(required:bigint,budget:bigint,evidence:string[]) {return {financiallyFeasible:required<=budget,executionStatus:evidence.length?'unverified':'not_evaluated',missingEvidence:evidence};}
