// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Minimal runtime interop; upstream parser licensed separately under MIT.
// 最小运行库类型衔接，上游解析器单独保留MIT许可。
declare module 'bpmn-moddle' {export class BpmnModdle {fromXML(xml:string,rootType?:string):Promise<{rootElement:any;warnings:unknown[]}>;}}
