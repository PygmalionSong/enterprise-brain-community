// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Validate an explicitly selected collection and primitive fields against CSDL.
// 按CSDL核对明确选定的集合及原始类型字段，不推断流程或扩大权限。
import {readODataCsdl} from '../connectors/odata-csdl.ts';
import {canonicalDiscoveryEndpoint} from './discovery-contracts.ts';
import {businessReadPolicy,type BusinessReadPolicy} from './business-read-contracts.ts';
const supported=new Set(['Edm.String','Edm.Boolean','Edm.Byte','Edm.SByte','Edm.Int16','Edm.Int32','Edm.Int64','Edm.Single','Edm.Double','Edm.Decimal','Edm.Guid','Edm.Date','Edm.DateTimeOffset','Edm.TimeOfDay','Edm.Duration']);
export function validateBusinessReadMetadata(input:BusinessReadPolicy,metadataEndpoint:string,raw:string){
 const {policy}=businessReadPolicy(input),metadata=readODataCsdl(raw),origin=new URL(canonicalDiscoveryEndpoint(metadataEndpoint));
 if(metadata.rawSha256!==policy.metadataSha256)throw Error('business_read_metadata_changed');
 if(!origin.pathname.endsWith('/$metadata')||canonicalDiscoveryEndpoint(new URL(policy.entity,origin).href)!==policy.endpoint)throw Error('business_read_entity_target_mismatch');
 const matches=metadata.sets.filter(set=>set.collection&&set.name.split('.').at(-1)===policy.entity);
 if(matches.length!==1)throw Error('business_read_entity_ambiguous_or_missing');
 const entity=metadata.entities.find(entity=>entity.id===matches[0].type);if(!entity)throw Error('business_read_entity_missing');
 for(const field of policy.fields){const property=entity.properties.find(p=>p.name===field);if(!property||property.collection||!supported.has(property.type))throw Error('business_read_field_unsupported');}
 return {policySha256:businessReadPolicy(policy).sha256,metadataSha256:metadata.rawSha256,entityType:entity.id,fields:[...policy.fields],validatedOnly:true,businessAuthorized:false,executable:false};
}
