// Fixed business expectations and negative contexts. / 固定经营预期及错误上下文。
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {partition,litresPerCase,pooledRatio,closeStock,moneyMinor,stockTotal,assertCompatible,financialFeasibility,type QueryContext} from '../src/core/semantics.ts';
const s=JSON.parse(await readFile('data/supply-scenario.json','utf8'));
test('ACC-02/03: scope partition and four-SKU South/HC/rest reconcile',()=>{
 assert.ok(partition(['HC-A','HC-B','REST'],[['HC-A','HC-B'],['REST']]));
 assert.throws(()=>partition(['HC-A','HC-B','REST'],[['HC-A','HC-B'],['REST','HC-A']]));
 for(const sku of s.skus){assert.equal(sku.hc.demand+sku.rest.demand,sku.south.demand);assert.equal(sku.hc.supply+sku.rest.supply,sku.south.supply);}
 assert.equal(s.skus.reduce((a:number,x:any)=>a+x.south.demand,0),480);
 assert.equal(s.skus.reduce((a:number,x:any)=>a+x.hc.demand-x.hc.supply,0),8);
});
test('ACC-04: mixed packs convert physical volume without equal-capacity assumption',()=>{assert.deepEqual(s.skus.map((x:any)=>litresPerCase(x.volumeMl,x.unitsPerCase)),[12,6,15,7.5]);assert.throws(()=>litresPerCase(0,24));assert.throws(()=>litresPerCase(500,12.5));});
test('ACC-05: inventory movement is not a sum of daily balances',()=>assert.equal(closeStock(400000n,900000n,810000n),490000n));
test('ACC-06/07: decimal money reconciles revenue, margin, AR and cash exactly',()=>{
 const yuan=(v:string)=>moneyMinor(v);
 assert.equal(yuan('52000000')-yuan('2600000')-yuan('800000'),yuan('48600000'));
 assert.equal(yuan('48600000')-yuan('32600000'),yuan('16000000'));
 assert.equal(yuan('9400000')+yuan('48600000')-yuan('42000000'),yuan('16000000'));
 assert.equal(yuan('18000000')+yuan('42000000')-yuan('36800000')-yuan('1200000'),yuan('22000000'));
 assert.equal(yuan('0.10')+yuan('0.20'),30n);assert.throws(()=>yuan('0.001'));
});
test('ACC-08: OTIF pools cohorts and preserves undefined/missing status',()=>{assert.equal(pooledRatio([{numerator:90,denominator:100},{numerator:1,denominator:2}]).value,91/102);assert.equal(pooledRatio([{numerator:0,denominator:0}]).status,'undefined');assert.equal(pooledRatio([{numerator:null,denominator:5}]).status,'missing');assert.throws(()=>pooledRatio([{numerator:3,denominator:2}]));});
test('ACC-41: transfer conserves group quantity, own/copack add only100',()=>{for(const row of s.transferConservation.stages)assert.equal(stockTotal([{identity:'origin',quantity:BigInt(row.origin)},{identity:'transit',quantity:BigInt(row.transit)},{identity:'dest',quantity:BigInt(row.destination)}]),60n);assert.equal(s.sources.own.quantity+s.sources.copack.quantity,100);assert.throws(()=>stockTotal([{identity:'same',quantity:60n},{identity:'same',quantity:60n}]));});
test('ACC-41: cash feasibility does not confer execution permission',()=>{const cash=Object.values(s.sources).reduce((a:number,x:any)=>a+x.quantity*x.cashCnyPerCase,0);assert.equal(cash,5220);assert.equal(financialFeasibility(5220n,6000n,['lot','arrival']).executionStatus,'unverified');assert.equal(financialFeasibility(5220n,4500n,[]).financiallyFeasible,false);});
test('ACC-10: differing period, fact kind, scope or enterprise cannot silently join',()=>{const c:QueryContext={enterpriseId:'a',scopeId:'HC',scopeVersion:1,periodStart:'2026-09-01',periodEnd:'2026-10-01',factKind:'constructed_actual',factVersion:'v1',scenarioId:'BASELINE',definitionVersion:1,unit:'CNY',currency:'CNY'};assert.doesNotThrow(()=>assertCompatible(c,{...c}));for(const k of ['enterpriseId','scopeId','periodStart','factKind','scenarioId','unit'] as const)assert.throws(()=>assertCompatible(c,{...c,[k]:'changed'}));});
