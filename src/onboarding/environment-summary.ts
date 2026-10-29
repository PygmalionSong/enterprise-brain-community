// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Minimal runtime facts only; never enumerate host identity, files or processes.
// 仅最小运行时事实，不枚举主机身份、文件或进程。
export function onboardingEnvironmentSummary() {
  const runtimeSupported = /^v24\./.test(process.version);
  const platformSupported = ['win32', 'linux'].includes(process.platform) && process.arch === 'x64';
  return {
    format: 'enterprise-brain.onboarding-environment/1',
    runtime: {node: process.version, platform: process.platform, architecture: process.arch},
    sourceRuntimeSupported: runtimeSupported && platformSupported,
    deploymentReady: false, storageQualified: false, systemInventoryCompleted: false,
    connectedSystems: null, nativePrerequisitesQualified: false,
    nextRequiredCheck: 'deployment_configuration', telemetry: false,
  };
}
