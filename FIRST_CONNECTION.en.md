# First connection: inspect before granting access

[中文](FIRST_CONNECTION.md) · [日本語](FIRST_CONNECTION.ja.md) · [Home](README.md)

The first-connection path separates finding an interface, understanding its metadata, authorizing a read and executing a business task. One successful HTTP response does not complete all four.


For a continuous CLI and HTTP walkthrough, run the [isolated enterprise host example](GETTING_STARTED.en.md). It initializes private configuration and accounts, imports a process, obtains programmatic business approval and queries results after a host restart. The HTTP source tests below are a separate route.

## Run an owned example

After the documented locked installation and build, run:

```text
node --test tests/business-metadata-http.test.ts
node --test tests/business-read-restart.test.ts
```

These tests create their own loopback source and accounts. They validate metadata against its digest, keep IT review separate from business approval, execute an explicitly installed Graph tool, project approved fields and retain an original receipt. Interrupted reads are looked up without an automatic second GET. They use constructed records and no external model or enterprise credentials.

## Use the IT workspace

Initialize the independent enterprise host using the private-input instructions in [HOST](HOST.en.md). Customer operations must provide the configured HTTPS origin and trusted TLS proxy; the backend itself binds loopback. Proxy authority stays on the server. There are no default credentials.

1. Sign in as an IT operator and open `/connections` through that HTTPS origin. Use the language selector for English, Chinese or Japanese.
2. Authorize exact metadata endpoints. The current transport accepts literal private IPv4 or127.0.0.1 targets, rejects redirects and proxies, and verifies HTTPS certificates strictly.
3. Start the bounded observation and inspect recorded protocol evidence. An unknown response stays unknown. A protocol match does not establish a vendor/product version.
4. Review ownership and purpose, then perform the fixed metadata read test. OData entities are a schema, not an inferred business workflow.
5. Review an entity, approved scalar fields, purpose and row bound against the current source. A separate business account reviews the request in `/workspace` and grants an expiring read authorization.
6. Integrate `businessReadGraphTool` explicitly in trusted application code. This factory is not registered in the default HTTP tool catalog. A read grant does not replace approval of an executable Graph plan.

The bounded metadata path requires no source changes. Business-task integration currently uses the SDK. Do not enter production credentials into this preview: credential-backed adapters are not implemented.

## Revocation and recovery

Current authority is checked before execution, at result commit and before later disclosure. Revocation withholds cached business data; it cannot recall bytes already sent. Unknown outcomes retain their original references rather than silently resubmitting a read.

Restoration revokes connection/read authority and preserves completed evidence and original receipts. A restored target starts parked. Signing in again does not renew a source grant. See [restoration boundaries](NATIVE_BACKUP_RESTORE.en.md) and the [implementation contract](docs/onboarding/IMPLEMENTATION.en.md).

## Supported boundary

This is a developer preview of bounded endpoint onboarding and controlled execution. DNS, IPv6, subnet scanning, secret-backed authentication and complete MCP HTTP are absent. Existing MCP stdio and reviewed BPMN/process-definition readers remain separate supported paths. No universal system discovery, automatic workflow inference or production identity integration is claimed.

Use [installation feedback](INSTALLATION_VALIDATION.en.md) for voluntary reproduction evidence. No report or GitHub login is required to use the code, and the product sends no installation telemetry.
