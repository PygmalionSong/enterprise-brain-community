# Controlled business inference and current-source citations

[中文](BUSINESS_INFERENCE.md)

Schema26 adds DurableBusinessAnalyzer,BusinessAnalysisResults and independent-host APIs above the default-off IT policy/explicit field selection.No default model,cloud routing,automatic tool selection,graph approval or business dispatch.Models come only from an explicitly installed local structured protocol;downstream forwarding is the customer's deployment choice.zh/en/ja request support is not evidence of live-model translation or business quality.

Prepare selected context,then POST /v1/graph/analysis/requests with idempotencyKey,goal,language,selection,contextHash and analysisAcknowledged:true.Selection retains selectionAcknowledged:true.GET /v1/graph/analysis/requests/by-key/{key} inspects the original request.GET /v1/graph/analysis/requests/{id} reads its currently authorized result.POST /v1/graph/analysis/requests/{id}/cancel requires expectedVersion.Writes require current business role/CSRF/Origin;IT cannot impersonate a business actor.Same-key requests never resend or debit twice.Changed goal/fields/language conflict.

Durable shared reservation precedes RPC.Bounded factory/model/source review holds no SQL transaction across model waits.Current source,roles,policy,original field hashes,model configuration and code/credentials are rechecked before/after factory and after reply.Terminal SQL checks cancellation/deadline before and after writes;late completion rolls back result/audit.States:reserved/completed/refused/invalid/unknown/cancelled.Cancel,timeout and unknown usage retain reservations without automatic resend.Old leases cannot publish or resurrect terminal rows.

Closed output/citation checks precede host copying of exact original values,receipt,tool version,content kind and timestamps.Model statements remain model-generated/unverified;no calculation,causality,benefit or outcome correctness is established,and no tool execution authority is granted.reportedUsage is protocol-provider self-report;actualInvoiceVerified=false.It is not an invoice.Durable output caps remain fully reserved without self-reported refunds.

Results/output hashes freeze atomically.Every read rechecks original-context current source/roles/policy/model;failure returns metadata and analysis:null without cached goal/prose.Restore retains completed result bytes/spend and marks pending requests unknown.It invalidates old sessions,model installation,analysis policy and observation confirmation without reading results or resuming.Current reads still depend on the original policy expiry/model configuration.Explicit current-authority review independent of model replacement/owner departure uses a [separate history policy](BUSINESS_HISTORY.en.md),without changing legacy GET or claiming a complete knowledge lifecycle.

Engineering evidence uses owned local HTTP model protocols,independent SQL facts and actual encrypted restore.No live enterprise models/vendors or business efficiency proof.Default tools return workflow metadata;operational inference requires customer-authorized business read tools.Approved cockpit/case UI is unchanged;boss-goal/insight UX is not connected.All15-domain60-stage coverage does not establish every vendor's compatibility.[New local quota periods](BUDGET_PERIODS.en.md) retain old reservations and uncertain external spend.Provider invoices/live-model quality remain unverified;see signed-product [managed upgrades](UPGRADE_CONTROL.en.md),without arbitrary-version/vendor rollout claims.


Deployment boundary:026 adds result columns and changes existing request-state/freeze contracts.An owned25 snapshot retained original data/shared spend,but the conservative upgrade checker correctly rejects the old-table contract change(rehearsal_table_contract_changed);the shadow was not started/cut over.Current scope is a fresh26 install and same-code restore.25-to26 needs explicit migration-contract acceptance and is not verified automatic upgrade/lossless rollback.


Read-boundary update:legacy Graph run HTTP now exposes only an explicit metadata/hash allowlist,never cached source payloads or original arguments.Business source data uses current-authority observation/inference APIs.Trusted programmatic GraphService.view is not directly public.


History update: the default-off, model-independent, current-authority API is documented in [business history](BUSINESS_HISTORY.en.md). Legacy GET retains its original model-policy restrictions.


Current-authority candidate/analysis/observation/run navigation uses [metadata lists](METADATA_LISTS.en.md),without content or execution authority.
