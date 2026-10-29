// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Preserve Windows path identity; Linux paths are case sensitive.
// 保留Windows路径语义；Linux路径区分大小写，不接受大小写别名。
export function canonicalPathKey(value:string,platform:NodeJS.Platform=process.platform){return platform==='win32'?value.toLowerCase():value;}
export function canonicalPathEqual(actual:string,declared:string,platform:NodeJS.Platform=process.platform){return canonicalPathKey(actual,platform)===canonicalPathKey(declared,platform);}
