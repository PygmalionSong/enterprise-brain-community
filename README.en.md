# Enterprise Brain

**A self-hosted foundation for enterprise business-agent teams.**

[English](README.md) · [中文](README.zh.md) · [日本語](README.ja.md)

## Compare the business tradeoffs. Verify what happened.

A region needs more stock. Production, transfers and co-packing can help, but cash, delivery and quality constraints must hold together. Enterprise Brain connects process context, explicit approval and source receipts so the work can be inspected across departments.

## Start here

- [Explore the three-language business case](https://pygmalionsong.github.io/enterprise-brain-community/?lang=en)
- [Run the persistent backend locally](RUN_OPERATING_CASE.en.md)
- [Understand the architecture](ARCHITECTURE_OVERVIEW.en.md)
- [Adapt one small source](EXTEND_A_SOURCE.en.md)
- [Read scope and limitations](PREVIEW_SCOPE.en.md)

The browser case keeps constructed local state. The local backend is a separate executable reference using constructed sources and deterministic policies. Neither is a live enterprise or live-model result.

![Enterprise operating blueprint](showcase/media/01-processes.png)

## Inspect the source receipts

The 15-domain blueprint stays visible. The supply path qualified here covers 800k cases from production, 600k from transfer and 200k from co-pack. Approval, accepted quantities, physical receipts, payment and sales are distinct. Payment/sales are not verified.

In an owned HTTP recovery test, three actions committed before response timeout. The backend queried their original identities, retained them across restart and verified 1.6m received cases with zero duplicate submissions.

[Inspect the source receipts](BACKEND_EVIDENCE.en.md)

## Install and run

Windows x64 · Node24.19.0 · pnpm11.25.0. Registry access is needed for locked dependencies. Stop at the first failed command.

```powershell
node scripts/verify-repository.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
node scripts/start-reference.mjs --acknowledge-owned-fixture
```

For recovery from a separate worker process, run the [controlled first task](FIRST_TASK.en.md). For an extension using the actual GraphTool contract, run the [inventory adapter lab](EXTEND_A_SOURCE.en.md).

## What this preview includes

Foundation modules, a persistent local reference workspace and a separate browser-only showcase. Process readers use explicit MCP/BPMN/OData subsets; tools are installed by operators. Models are replaceable, but their proposals do not grant authority. This is a developer source preview, not a complete signed one-step installer or production qualification. Linux, independent customer-host operations and live-model quality remain unverified.

## Discuss and contribute

Questions/process models belong in Discussions; reproducible defects and voluntary installation reports belong in Issues. Fork and propose a reviewed PR; public access does not grant official write permission. Never attach credentials, databases or private customer logs.

[Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions) · [Issues](https://github.com/PygmalionSong/enterprise-brain-community/issues) · [Contact / 联系 / 連絡](CONTACT.en.md) · [Security](SECURITY.en.md) · [Contribute](CONTRIBUTING.en.md)

## License and deployment ownership

Apache-2.0. Retain LICENSE, NOTICE and third-party attribution. Enterprises may deploy, modify and operate their own foundation. No paid offer or production SLA is introduced.

[LICENSE](LICENSE) · [NOTICE](NOTICE) · [Third-party notices](THIRD_PARTY_NOTICES.en.md)

[Maintained by PygmalionSong. The project draws on10+ years of management consulting and digital transformation; see the project story.](STORY.en.md)
