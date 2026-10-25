# Enterprise Brain · Backend-connected operating reference

[中文](RUN_OPERATING_CASE.zh.md) · [日本語](RUN_OPERATING_CASE.ja.md) · [Scope](ASSET_SCOPE.en.md)

Run a fifteen-domain operating workspace and a cross-functional supply decision against a persistent backend and separate constructed HTTP/SQL sources. The UI supports English, Chinese and Japanese. This source candidate is a reference application of the enterprise-agent foundation, not a production qualification or signed one-step installer.

## Run

Declared and observed environment: Windows x64, Node24.19.0 and pnpm11.25.0. Dependency installation requires registry access. Unzip into a new source directory, then run one command at a time and stop at the first failure:

```powershell
node scripts/verify-operating-reference.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
node scripts/start-reference.mjs --acknowledge-owned-fixture
```

Open the printed loopback HTTP address. This entry uses an automatically allocated port and never replaces an existing product server. Stop with Ctrl+C or type stop in the retained terminal. Restart with the same command to retain the original local case. The entry refuses enterprise DATABASE_URL/EB_MODE configuration, unowned existing .data and an active or unfinished reference lock; it never kills another process or clears a stale lock automatically. Keep .data private; do not upload its databases, session/control state or logs. It is deliberately excluded from this source archive. Do not run this reference in a production installation.

## Walk the case

Open Processes → Supply and cash. The backend proposes own production80, regional transfer60 and co-pack20 ×10k cases, with cash5,220×CNY10k. Explicitly approve, then inspect accepted quantity separately from verified receipts. Open Reference environment controls and scope → Complete receipt in reference systems to advance only the constructed source. The backend looks up the original actions and closes fulfillment obligations; the received quantity becomes160×10k cases. Payment and sales outcomes remain unverified.

Execution records identify the original business task and source documents. The recovery history shows persistent backend events, grouping repeated polling for readability. The backend retains the full event sequence; UI retrieval is bounded to1000 events and explicitly marks truncation.

## Evidence and boundaries

The maintainer observed this page approving a real backend plan, three actual constructed-source HTTP commits whose delayed responses exceeded the unchanged1500ms client timeout, original-action lookup with zero duplicate submissions, backend/source restart with identical task/action/document identities, and160×10k verified receipts. The response-loss injection lived in the maintainer's private acceptance harness; the standard entry does not inject faults. Reproduce the protocol recovery independently with the checked-in runtime test named ACC-12. The maintainer reused a qualified dependency cache; a clean registry installation or independent customer host was not verified in this run.

The planner uses a deterministic replay model and finite business policy. No live model or real customer endpoint is used. The broader charts and business-domain reference data are constructed; the accepted/received supply states in the execution dialog are persisted backend results. Only the supply chain described above is qualified by this run. Other reference pages do not establish executable coverage of all60 stages. No geographic geometry, external map service or camera observations are included. [License](LICENSE) · [Scope](ASSET_SCOPE.en.md).


[Project / 项目 / プロジェクト](README.md) · [Controlled first task / 受控首任务 / 最初のタスク](FIRST_TASK.en.md).
