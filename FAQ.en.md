# Before you start

## What can I try first?

Run the [first task](https://github.com/PygmalionSong/enterprise-brain-community/blob/v0.1.0-preview.2/FIRST_TASK.en.md): read two example processes, approve execution, and see how the task looks up the original action after a tool writes a record but loses its response. The example uses constructed data and needs no enterprise account or model API key.

## Can I connect my company's systems directly?

You need to develop or configure adapters and define read scope and business authority. This release provides reference onboarding and bounded reads. It does not scan an entire enterprise network or infer complete business processes from database tables. The business-read tool requires explicit SDK integration and is not enabled in the default HTTP tool catalog. Read the [release scope](https://github.com/PygmalionSong/enterprise-brain-community/blob/v0.1.0-preview.2/PREVIEW_SCOPE.en.md) before integration.

## Where is data stored?

The runtime stores processes, authority, plans and execution records in the deployment environment. Existing ERP, CRM, SRM and WMS systems retain authoritative business records. The project does not automatically upload installation reports or enable hosted models or paid services. The deploying organization manages its servers, credentials and operations.

## How can I ask questions or contribute?

- If a task fails, open an [Issue](https://github.com/PygmalionSong/enterprise-brain-community/issues) with the version, environment, reproduction steps and redacted error details.
- Discuss integration approaches or business scenarios in [Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions).
- Propose code or documentation changes through a Pull Request for maintainer review.

Do not submit credentials, customer records or unredacted logs.
