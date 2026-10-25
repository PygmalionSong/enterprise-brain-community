// Server-owned confirmation bindings, never credentials or arbitrary row filters.
// 服务端生成确认绑定，不接收凭证或未经实现的行过滤声明。
import {z} from 'zod';
export const mappingSchema=z.object({version:z.string().min(1).max(100),keys:z.array(z.string().min(1).max(100)).min(1).max(16),quantityUnit:z.string().min(1).max(80),currency:z.string().max(8).nullable(),timezone:z.string().min(1).max(80),cardinality:z.literal('unique')}).strict();
export const confirmationSchema=z.object({systemName:z.string().trim().min(1).max(120),businessPurpose:z.string().trim().min(1).max(500),businessOwnerRole:z.string().trim().min(1).max(120),mapping:mappingSchema,readAcknowledged:z.literal(true),processAcknowledged:z.boolean().default(false),allowWrite:z.boolean().default(false),sandboxWriteAcknowledged:z.boolean().default(false)}).strict().refine(v=>!v.allowWrite||v.sandboxWriteAcknowledged,{message:'sandbox_confirmation_required'});
