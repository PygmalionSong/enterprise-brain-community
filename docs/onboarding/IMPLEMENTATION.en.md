# First connection: implementation and limits

[中文](IMPLEMENTATION.md)

An IT operator authorizes exact endpoints before the product reads and records protocol evidence. The operator reviews system ownership and purpose; a fixed adapter then performs a metadata read test. OData entities do not establish a business workflow.

The current transport accepts explicit private IPv4 or127.0.0.1 endpoints, rejects redirects and proxies, and verifies HTTPS certificates strictly. DNS, IPv6, subnet scanning, credential storage and a complete MCP HTTP client are not implemented. Multiple URLs are not automatically one system. Discovery candidates receive no automatic read or workflow authority.

IT can validate entities, fields, purpose and row bounds against the current source. A separate business account approves an expiring read grant. IT review does not replace business approval. Policies, grants and source-validation receipts persist. Current authority is checked before execution, at result commit and before later disclosure; revocation withholds cached data. Revocation cannot recall bytes already sent.

`businessReadGraphTool` is an explicitly installed SDK factory with a same-database-transaction authority guard. It is not registered in the default HTTP tool catalog. Factory tests and approval screens do not mean the default host has enabled business reads. Workflows still require supported definitions to be imported and reviewed, followed by separate business approval of an execution plan.

Read actions retain their original references and receipts. Lost responses and process interruptions are resolved through original-reference lookup without an automatic second GET. Uncertain outcomes remain unknown. Restoration revokes new connection authority, preserves completed evidence and marks issued but unconfirmed work unknown. Restored PGlite targets start parked and require fresh sign-in and approval.

Windows and Ubuntu implementation, source tests, actual database contracts, signed packages and independent-host acceptance are recorded separately. None alone establishes universal vendor compatibility, production authentication, high availability or unbounded capacity.
