// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Query strings are allowed only for these passive GET collections.
// 仅这些被动GET集合允许白名单查询参数。
import type {GraphMetadataKind} from './graph-metadata.ts';
const paths:Record<string,GraphMetadataKind>={'/v1/it/graph/planning/candidates':'planning_candidates','/v1/graph/analysis/requests':'business_analyses','/v1/graph/observations':'business_observations','/v1/graph/runs':'graph_runs'};
export function graphMetadataRequest(method:string|undefined,pathname:string):GraphMetadataKind|null{return method==='GET'&&Object.hasOwn(paths,pathname)?paths[pathname]:null;}
export function graphMetadataQuery(url:URL){const params=url.searchParams;for(const key of params.keys())if(!['limit','cursor'].includes(key)||params.getAll(key).length!==1)throw Error('metadata_query_invalid');const limit=params.get('limit'),cursor=params.get('cursor');if(limit!==null&&!/^(?:[1-9]|1[0-9]|20)$/.test(limit))throw Error('metadata_query_invalid');return {...(limit!==null?{limit:Number(limit)}:{}),...(cursor!==null?{cursor}:{})};}
