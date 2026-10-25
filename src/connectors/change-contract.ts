// Replace a complete business group atomically; an empty group is a tombstone.
// 按业务组原子替换；空组代表删除，不把取消订单当销售实现。
import {z} from 'zod';
export const changeBatchSchema=z.object({sourceId:z.uuid(),sourceVersion:z.number().int().positive(),asOf:z.iso.datetime(),checkpoint:z.string().min(1).max(1024),complete:z.boolean(),changes:z.array(z.object({key:z.string().min(1).max(240),rows:z.array(z.record(z.string(),z.unknown())).max(128)}).strict()).max(128)}).strict().superRefine((v,ctx)=>{if(new Set(v.changes.map(c=>c.key)).size!==v.changes.length||v.changes.reduce((n,c)=>n+c.rows.length,0)>128)ctx.addIssue({code:'custom',message:'invalid_change_batch'});});
export type ChangeBatch=z.infer<typeof changeBatchSchema>;
