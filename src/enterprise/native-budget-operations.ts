// Explicit private native allowance periods; preserve immutable spend and restore fences.
// 明确的原生私人额度周期，保留不可变费用记录与恢复冻结。
import {readPrivateJson} from './configuration.ts';
import {readNativeDeployment} from './native-configuration.ts';
import {enterpriseBudgetPeriodChangeSchema} from './budget-operations.ts';
import {withStoppedNativeConfiguration} from './native-configuration-operation.ts';
import {ModelBudgetPeriods} from '../runtime/model-budget-periods.ts';
import {digest} from '../identity/service.ts';

export async function nativeEnterpriseBudgetPeriod(root:string,configFile:string,inputFile:string){
 const input=enterpriseBudgetPeriodChangeSchema.parse(await readPrivateJson(inputFile)),config=await readNativeDeployment(configFile),configurationSha256=digest(JSON.stringify(config));
 if(configurationSha256!==input.expectedConfigurationSha256)throw Error('enterprise_budget_configuration_conflict');
 return withStoppedNativeConfiguration(root,configFile,config,'models',async db=>{
  const p=(await db.query('SELECT role,disabled,authorization_version FROM principal WHERE enterprise_id=$1 AND id=$2',[config.enterpriseId,input.principalId])).rows[0];
  if(!p||p.disabled||p.role!=='it')throw Error('enterprise_budget_operator_invalid');
  const actor={id:input.principalId,enterpriseId:config.enterpriseId,role:'it',authorizationVersion:Number(p.authorization_version)},periods=new ModelBudgetPeriods(db);
  try{return {...(input.action==='inspect'?await periods.snapshot(actor):await periods.closeAndOpen(actor,input.period)),configurationSha256,started:false};}
  catch(e){if(e instanceof Error&&e.message==='not_authorized')throw Error('enterprise_budget_operator_invalid');throw e;}
 });
}
