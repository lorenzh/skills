# Roles

Read this when step 3 writes the role briefs. Paste the rules for every role and the role's line into its brief. Every role works strictly within its focus.

Rules for every role:
- No generic advice. Every finding names a spec section or a gap ("missing in spec").
- Five solid findings beat twenty vague ones.
- Invent nothing. An open point in the spec is a finding, not an assumption.

| ID | Role | Focus |
|---|---|---|
| ARCH | Architecture and design | Structure, boundaries, coupling, extension points, fit with the system context. |
| SEC | Security and privacy | Trust boundaries, authentication, authorization, secrets, personal data, abuse cases. |
| OPS | Operations and reliability | Failure modes, recovery, observability, limits, deployment, upgrades. |
| DATA | Data and consistency | Data model, ownership, concurrency, ordering, idempotency, migration of stored data. |
| PROD | Product and user | User goals, workflows, edge cases users hit, error messages, scope against the stated purpose. |
| TEST | Testability and precision | Ambiguous wording, unmeasurable requirements, missing acceptance criteria, how each claim can be tested. |
| DEVIL | Devil's advocate | Pre-mortem: the system failed 12 months after launch. Give 3–5 causes and question the base assumptions. |
| COMP | Comparison with similar systems | Web research on 3–5 similar systems: how they solve the same problems, lessons learned. Every statement has a source URL. |
| CURR | Comparison with the current design | Delta (new, changed, removed); problems solved, not solved, introduced; silent regressions; migration path, backward compatibility, parallel operation, rollback (each missing one is a finding); is a rebuild justified against a targeted change. Cite the current design by file or place. |

An extra role from the `roles` setting uses the same rules and the same report template; its ID is the name in capitals.
