# Enterprise Brain

**A self-hosted foundation for enterprise agents**

[English](README.md) · [中文](README.zh.md) · [日本語](README.ja.md)

Give enterprise agent teams process context, authority, task execution and result verification. Existing ERP, CRM, SRM and WMS systems retain authoritative business records.

## Start with one cross-process task

Read two example processes, approve a plan and execute it. When a tool writes a source record but loses its response, look up the original action and verify the result. The example uses constructed data and needs no enterprise account or model API key.

[Run the first task](FIRST_TASK.en.md)

![Beverage business processes](showcase/media/01-processes.png)

## Choose a starting point

- [Explore the beverage case](https://pygmalionsong.github.io/enterprise-brain-community/?lang=en)
- [Run the local supply case](RUN_OPERATING_CASE.en.md)
- [Read the architecture](ARCHITECTURE_OVERVIEW.en.md)
- [Adapt one source](EXTEND_A_SOURCE.en.md)
- [Connect a business source](FIRST_CONNECTION.en.md)
- [Frequently asked questions](FAQ.en.md)

## Install and run

Node24.19.0 · pnpm11.25.0

```sh
node scripts/verify-repository.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
node scripts/start-reference.mjs --acknowledge-owned-fixture
```

## Current scope

This is a developer source preview. Source checks have run on Windows x64 and Ubuntu24.04 x64. Independent customer hosts, production capacity, live-model quality and customer business outcomes remain unverified. The beverage case uses constructed systems and deterministic policies; the browser experience and local backend run separately.

Tools require explicit installation and authority. Network-wide discovery and automatic process inference from database tables are not supported. The business-read tool is not registered in the default HTTP tool catalog. A complete production one-click installer is not provided.

[Scope / English](PREVIEW_SCOPE.en.md) · [CI / validation](PREVIEW_NOTES.en.md)

## Discuss and contribute

Report reproducible bugs in Issues with the version, environment and a redacted example. Discuss integrations and business scenarios in Discussions. Propose code or documentation changes through Pull Requests. Do not upload credentials, databases or customer records.

[Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions) · [Issues](https://github.com/PygmalionSong/enterprise-brain-community/issues) · [Contact](CONTACT.en.md) · [Security](SECURITY.en.md)

## License

Source and examples use Apache-2.0. Retain applicable copyright, license and NOTICE statements when redistributing.

[LICENSE](LICENSE) · [NOTICE](NOTICE) · [Third-party notices](THIRD_PARTY_NOTICES.en.md) · [Attribution](ATTRIBUTION.en.md)

PygmalionSong · [Project background](STORY.en.md)
