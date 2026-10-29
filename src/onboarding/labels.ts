// SPDX-FileCopyrightText: 2026 Enterprise Brain contributors
// SPDX-License-Identifier: Apache-2.0
// Original project / 原项目: Enterprise Brain
// https://github.com/PygmalionSong/enterprise-brain-community
// Shared IT onboarding copy; stable status codes are never translated.
// IT接入共用文案；状态码保持稳定，不翻译。
export const onboardingLabels = {
  zh: {
    title: '系统接入', environment: '环境检查', scope: '授权范围', discovery: '发现系统',
    review: '核对系统信息', readTest: '测试读取', connected: '接入状态',
    unknown: '暂未识别', protocol_identified: '已识别协议', needs_authorization: '需要读取权限',
    unsupported: '当前不支持', evidence: '识别依据', notExecutionAuthority: '识别结果不代表操作授权',
  },
  en: {
    title: 'System connections', environment: 'Environment', scope: 'Authorized scope', discovery: 'Discover systems',
    review: 'Review system identity', readTest: 'Test reading', connected: 'Connection status',
    unknown: 'Not identified', protocol_identified: 'Protocol identified', needs_authorization: 'Read access needed',
    unsupported: 'Not supported yet', evidence: 'Identification evidence', notExecutionAuthority: 'Identification does not grant operating authority',
  },
  ja: {
    title: 'システム接続', environment: '環境確認', scope: '許可された範囲', discovery: 'システムを検出',
    review: 'システム情報を確認', readTest: '読み取りをテスト', connected: '接続状況',
    unknown: '未識別', protocol_identified: 'プロトコルを識別', needs_authorization: '読み取り権限が必要',
    unsupported: '現在は未対応', evidence: '識別の根拠', notExecutionAuthority: '識別結果は操作権限を付与しません',
  },
} as const;
