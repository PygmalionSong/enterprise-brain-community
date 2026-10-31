# Business and technical architecture

The business map shows the responsibilities involved. The technical view separates the foundation, model service and existing systems. The decision view follows the supply case. See [preview scope](../PREVIEW_SCOPE.en.md) for executable coverage.

## Bring a cross-team problem into one decision

A shortage involves demand, stock, capacity, delivery and cash. The case shows how those responsibilities connect while each system keeps its records.

[![Bring a cross-team problem into one decision](diagrams/business.en.png)](diagrams/business.en.svg)

## Infrastructure your team can build on

The foundation stores processes, checks access, and records approved plans and their results. Each company configures its system adapters, products, units and approval rules. Models propose work; the software checks access before execution.

[![Infrastructure your team can build on](diagrams/systems.en.png)](diagrams/systems.en.svg)

## Follow a plan through to its result

The supply case compares production, transfers and co-packing under shared capacity, cash and quality constraints. Approval, system acceptance and physical receipt remain separate. Payment and sales require their own evidence.

[![Follow a plan through to its result](diagrams/decision.en.png)](diagrams/decision.en.svg)

## From diagram to code

| Responsibility | Entry point |
|---|---|
| Process definitions and revisions | [Process registry](../src/connectors/process-registry.ts) |
| Plans, approval and tool execution | [Graph service](../src/runtime/graph-service.ts) |
| Separate model protocol and call boundary | [Model transport](../src/runtime/model-transport.ts) |
| Adapt enterprise systems | [First connection](../FIRST_CONNECTION.en.md), [minimal tool adapter](../EXTEND_A_SOURCE.en.md) |

Each deployment supplies object relationships, units and business rules. An API or metadata schema does not automatically provide that business meaning; the system abbreviations do not indicate vendor certification. See [architecture overview](../ARCHITECTURE_OVERVIEW.en.md) for execution and deployment boundaries.
