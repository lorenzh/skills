# Queue spec

## Behavior
Jobs retry forever after failures. Storage uses UTF-8.

## Decisions
1. The queue is named jobs. Confirmed.
2. Two retries. Needs confirmation.

## Acceptance criteria
A successful job runs once.

## Unverified points
Default retry count awaits user confirmation.
