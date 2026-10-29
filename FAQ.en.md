# Getting started

## What can I try without installing anything?

Open the [beverage business case](https://pygmalionsong.github.io/enterprise-brain-community/?lang=en). Compare supply options, browse business processes and explore store operations. The case uses sample data; its controls update browser-local state.

## What does the runnable task demonstrate?

The [first task](FIRST_TASK.en.md) reads two sample processes, requests approval and executes a plan. It tests recovery after a system saves a change but loses its response. The backend checks the existing operation before deciding what to do next. No company account or model API key is needed. This task runs locally, separately from the browser case.

## How do I connect my company's systems?

Build or configure an adapter, define which information it can read, and assign authority to approve and execute tasks. Start with the [connection guide](FIRST_CONNECTION.en.md). The business-read tool must be installed through the SDK; it is not in the default HTTP tool catalog. The current version does not scan an entire company network or infer complete workflows from database tables.

## Where are runtime data and reports stored?

The runtime stores process definitions, permissions, plans and execution records in your deployment environment. Business records stay in the existing systems. The optional [installation report](INSTALLATION_VALIDATION.en.md) is written to a local file; you choose whether to share it. Servers, credentials and model connections are configured by the deploying team.

## Where can I ask questions?

Use [Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions) for integration questions and [Issues](https://github.com/PygmalionSong/enterprise-brain-community/issues) for reproducible bugs. For collaboration, see [Contact](CONTACT.en.md). Please use sample data in reports and remove account details or API keys.
