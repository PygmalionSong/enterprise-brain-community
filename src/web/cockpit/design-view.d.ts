// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
export type CockpitContext={lang:'zh'|'en'|'ja';page:string;domain:string|null;step:number;shelf:number;period:'morning'|'evening';fiscalYear:number;reportPeriod:string;geoLevel:string;contextRegion:string;geoProvince:string|null;geoCity:string|null;country:string;scope:string};
export type CockpitSnapshot=Record<string,unknown>;
export function mountCockpit(root:HTMLElement,ports:{data:Record<string,any>;supplyStatus:()=>Record<string,any>|null;loadState:()=>CockpitSnapshot|null;saveState:(value:CockpitSnapshot)=>void;onRender:(context:CockpitContext)=>void;onAction:(value:{kind:string;state:Record<string,any>})=>void}):{snapshot:()=>CockpitSnapshot;navigate:(value:CockpitSnapshot)=>void};
