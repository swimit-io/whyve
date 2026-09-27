---
title: "{{title}}"
summary: "{{summary}}"
kind: "decision"
scope: "{{scope}}"
key: "{{key}}"
keywords: ["{{keyword}}"]
created_at: "{{created_at}}"
id: "{{id}}"
schema: "context-decision/v2"
state: "current"
authorization_source: "{{user|policy}}"
revisit_on: "{{YYYY-MM-DD}}"
---

## Decision

{{the user's explicit choice}}

## Rationale

{{why}}

## Rejected alternatives

- {{alternative}}: {{why it was rejected}}

## Evidence and constraints

- {{evidence or constraint}}

## Trade-offs

- {{accepted cost}}

## Revisit conditions

- {{condition that permits reassessment}}

## Sources

- authorization: {{message reference}}
- serves:intent: {{ctx_ id of an INTENT}}
