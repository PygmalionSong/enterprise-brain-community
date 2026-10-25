# Private traffic parking, activation and drain

[中文](TRAFFIC.md) · [Enterprise host](HOST.en.md)

The independent enterprise host persists active/parked admission, bound to deployment UUID/expected version. Parked rejects new logins/all normal pages/APIs while local health/private operations remain. New initialization explicitly starts active/version0; legacy installations/restoration points without policy default parked/version0. Normal shutdown transiently closes this process's admission without silently changing persisted restart policy.

```text
node scripts/enterprise.mjs traffic-status --config ABSOLUTE_PRIVATE_CONFIG
node scripts/enterprise.mjs park --config ABSOLUTE_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_CHANGE
node scripts/enterprise.mjs activate --config ABSOLUTE_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_CHANGE
```

Private JSON change:expectedVersion is a verified nonnegative integer;optional waitMs0–5000,default1000. Read traffic-status before retrying rather than guessing versions. Portable EnterpriseAction accepts traffic-status/park/activate;last two use PrivateInput paths. Offline permits inspection/parking only. Activation requires a verified running instance with current schema.

Commands share start/stop/backup operation exclusion. Running transitions verify health identity before sending private control authority/instance UUID to/ops/traffic. Browser Origin,proxy headers,wrong instances/stale versions/keys fail. Control secrets never appear in arguments/URLs/browser/results. This is neither a public API nor identity-console privilege.

After parking commits,new admission fails immediately. Accepted async handlers remain counted until server processing ends;client disconnect does not mean cancellation. A drain timeout returns202/drained=false,retaining parked state/accurate counts. Active handlers prevent activation. Drain covers local HTTP handlers,not completion/cancellation of accepted external business actions or new background graph scheduling.

traffic.json uses bounded private files,expected versions,synced temporary writes/atomic replacement. Memory changes only after persistence. Keep the latest64 local-control history entries,without identifying human operators. This is not complete/immutable/compliance audit or arbitrary power-loss/shared-storage HA. Customer operators provision ACLs;file mode is not Windows access-control setup.

Shutdown closes admission,waits up to5 seconds for local handlers,then closes HTTP/database. Timeout does not close a still-used database and keeps admission stopped;retry shutdown after handlers finish. The CLI also has bounded waiting. Killing a process never proves graph actions cancelled.

Encrypted enterprise backup explicitly stores policy. Same-code recovery retains mode/version/recent history while invalidating all old browser sessions. Missing policies remain parked,never silently open. Restore neither activates nor runs candidate business code. Upgrade orchestration must verify parked state/use a fresh rollback point after fencing old writes. The signed product [managed upgrade](UPGRADE_CONTROL.en.md) chains stop/fresh backup/conservative migration/pointer/activation;it never automatically restores old snapshots after new writes.

Bare programmatic createEnterpriseApplication installs this gate only when a trusted factory supplies TrafficAdmission;the independent CLI always wires persistence. Custom tools,roles,approval/source-receipt contracts stay separate:activation never expands business write authority.

Background delegation shares admission counts and park/drain with HTTP;see [graph supervision](SUPERVISION.en.md). Restoring active traffic does not re-enable restored graph delegations.
