# Native single-database instance ownership

[中文](NATIVE_OWNERSHIP.md) · [Programmatic host](NATIVE_HOST.en.md) · [Connection core](NATIVE_RUNTIME.en.md)

Native factories require `ownershipAcknowledged:true` and exclusive database session ownership. Native private CLI, installation, backup, recovery and high availability are not yet supported. The existing PGlite entry and recovery contracts remain unchanged.

`connectNativeRuntime` assigns an opaque identity using the `eb-runtime:` application-name prefix. `acquireNativeRuntimeOwnership` derives a separate, stable client from the verified account and TLS policy. It holds `pg_try_advisory_lock(71245120,1)` in the current database. The ordinary pool still allows five connections; ownership adds one. Once a connection has hosted, close it and reconnect before claiming ownership again.

After locking, the core refuses surviving pools with different runtime identities, including other roles. This prevents takeover when the owner backend has died but its workers remain. The rule constrains official hosts; it cannot constrain arbitrary SQL or trusted administrators. Database-local locks do not make the existing global `eb_app` migration suitable for shared clusters.

The factory binds ownership to ordinary APIs and health checks. Loss stops admission and returns HTTP 503; schema state can remain `current` to distinguish the cause. The connection becomes ineligible for another host. Accepted work retains its original action IDs, leases, receipts and business authority. Losing ownership does not cancel external work.

Without an external traffic policy, the factory counts handlers in memory. Disconnected clients stay in flight. `await app.close()` stops admission, waits up to five seconds for handlers, then closes HTTP and releases ownership. It also works before listening. Close and release are idempotent. A drain timeout retains ownership and returns `enterprise_traffic_drain_timeout`; inspect ongoing work and retry. Always close the application before its database. This counter does not provide persistent park/activate operations.

Fixed error codes include `native_runtime_database_in_use`, `native_runtime_previous_connections_present`, `native_runtime_ownership_connection_used`, `native_runtime_ownership_unavailable`, `native_runtime_verified_connection_required` and `native_runtime_ownership_input_invalid`. Errors contain no other account, address or SQL. These capabilities are for trusted programs, never browser, model or arbitrary SQL tools.

Local checks cover actual backend termination, surviving pools across roles, five concurrent workers, closing before listening, and draining disconnected handlers while retaining ownership. Cross-host partitions and automatic failover remain unverified. Native deployment, DBA setup, backup, recovery and upgrades still need integration. Stopping and reacquiring a lock does not provide an atomic handoff.
