# Security lens

Read this when the diff touches a trust boundary. Without that, write "Security: not triggered (reason)" and stop.

## Triggers

The diff or the project touches one of these:

- authentication, authorization, sessions
- input from outside (HTTP, files, CLI arguments, environment, messages)
- shell or process calls, file paths, database queries
- cryptography, randomness, secrets, configuration that holds credentials
- serialization and deserialization
- dependency manifests and lockfiles
- CI workflows and their permissions

The project's own instruction files may also declare it security-relevant.

## Check

1. Name the asset and the attacker in one line each.
2. For each touched boundary, follow the data from the entry to where it is used. Read the code around the diff, not only the changed lines.
3. Look for unchecked input reaching a sink, widened permissions, secrets in the diff or in logs, and new dependencies that run install scripts.

## Proof

- A request or input against a local instance that shows the effect, or a failing test, or scanner output for this sha.
- Never test against production or shared systems.
- A weakness that needs an attacker who already has the same rights is not a finding.
- Hardening advice without a demonstrated effect is not a finding.

## Level

Exploitable with outside input: needs fix. Exploitable only in a realistic misconfiguration the repo documents: should fix. Everything else is dropped and counted.

Keep security findings out of public places until the user has seen them.
