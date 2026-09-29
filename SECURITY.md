# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/swimit-io/whyve/security/advisories/new). Do not disclose exploit details, private repository paths, credentials, pending receipts, or user context in a public issue.

Whyve is maintained in the `swimit-io/whyve` repository.

Security-sensitive areas include vault path containment, approval and lifecycle binding, runtime identity, CAS and lock enforcement, atomic writes and rollback, symlink handling, and protection against applying altered or replayed frozen material.

Include the affected plugin and version, host, Node.js version, a minimal reproduction, expected and actual behavior, and redacted diagnostic output. Remove secrets, usernames, home-directory paths, repository paths, and other local identifiers.

Only the latest published release receives security fixes; older versions may require upgrading. Acknowledgement and remediation timing depend on severity and maintainer availability, so no fixed response-time guarantee is made.
