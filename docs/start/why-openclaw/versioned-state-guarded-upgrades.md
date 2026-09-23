---
summary: "Database-first state, schema version contracts, and guarded updates"
title: "Versioned state, guarded upgrades"
read_when:
  - You need to know whether an OpenAgent upgrade can break your on-disk state
---

Runtime state is database-first: one global SQLite store, one per agent, with a written contract that runtime code never reads or writes JSON sidecars as active state. The contract is machine-checked in CI ([database schemas](/reference/database-schemas)). Schemas carry a two-place version contract; a build refuses to open a database newer than itself. [`openclaw update`](/cli/update) refuses targets whose declared schema support is older than your on-disk databases; legacy target packages without schema metadata cannot be preflighted. [`openclaw doctor --fix`](/cli/doctor) is the single owner of file-to-SQLite migrations and records a receipt for each one. SQLite snapshots in [backups](/cli/backup) use SQLite's online-backup API and are integrity- and hash-checked during creation and publication. Whole-archive verification does not bind ordinary file payloads to content hashes; restore never happens in place. [Restart recovery](/gateway/restart-recovery) resumes interrupted turns under a bounded attempt budget, and a crash-loop breaker keeps the control plane reachable while suppressing channel autostart.

OpenAgent installs from source: an update moves a git checkout to newer commits, rebuilds it, and runs the same schema guards and Doctor migrations before the new Gateway serves.
