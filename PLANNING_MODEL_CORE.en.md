# Durable planning model assembly core

[中文](PLANNING_MODEL_CORE.md) · [Storage](PLANNING_STORAGE.en.md) · [Context](PLANNING_CONTEXT.en.md)

`DurableGraphPlanner` is a programmatic module for trusted host code,combining current context,durable call reservations and an explicitly installed StructuredModel factory.Default uninstalled,without mock/case fallback.The independent host explicitly assembles CLI/candidate HTTP through the [installation contract](MODELS.en.md).Uninstalled models remain unconfigured;boss-goal UI is not implemented.

`generate` accepts goal,explicit scope,configuration version and idempotency key.Persist context SHA/snapshot and call/maximum-output-token reservations before granting one initial dispatch.Identical keys return the original candidate.Timeout/errors/unknown usage never refund or automatically retry.Recheck configuration/installed identity,current IT and scope before calling.Never hold a database transaction while waiting for models.

Factories receive reserved output limits and remaining timeout.Verify exact profiles on request/reply.An outer AbortSignal/deadline prevents late abort-ignoring promises from becoming candidates.`cancel` invalidates the lease durably before requesting interruption;it cannot undo computation/spend already incurred.Restarts never redispatch old candidates.Configuration/authority/source drift blocks publication.Reported tokens are separate and are not verified invoices.

The wire format is one closed object with every field required:`format,kind,questions,rationale,assumptions,routes,bindings`.Each binding has bounded `argumentsJson`;after decoding,the server still checks current tools,argument schemas,processes and graph structure.The closed envelope follows [official structured-output rules](https://developers.openai.com/api/docs/guides/structured-outputs) for an object root,required fields and closed properties.Protocol shape is not vendor acceptance;live models remain unverified.

Models produce need_input/candidate data only.Successful deterministic review persists the candidate,context SHA and applicable graph hash,without inserting plans/approvals/runs/actions or calling business-tool authorize/submit/lookup.Adoption still requires current-source review,explicit IT compilation and separate business approval.Process definitions alone are not business facts;authorized observations/data-reading assembly remain gaps.

Both local HTTP dialect tests use owned structured-response servers with constructed reported usage,not live model results or charges.This module is not an operating-system sandbox.Factories/validators are explicitly trusted installed code.Host installation permits declared local protocols only,without automatic provider selection/cloud routing.Public candidates exclude state,secrets and private project material.


See [candidate adoption](CANDIDATE_ADOPTION.en.md) for explicit frozen-plan creation; independent business approval remains required and no automatic execution occurs.
