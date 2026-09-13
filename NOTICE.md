# NOTICE

```
Document:    OpenAgent Attribution Notice
Version:     v1.1.0
Author:      Celaya Solutions
Contact:     hello@celayasolutions.com
Date:        2026-09-13
SHA256:      [pending]
Chain:       n/a
Tx:          [not anchored]
License:     MIT (see LICENSE)
```

**OpenAgent** is a derivative work of **OpenClaw**, the open-source AI
assistant stewarded by the OpenClaw Foundation, an independent 501(c)(3).

- Upstream project: https://github.com/openclaw/openclaw
- Upstream documentation: https://docs.openclaw.ai
- Upstream license: MIT, Copyright (c) 2026 OpenClaw Foundation

OpenAgent is an educational fork maintained by Celaya Solutions for course
use. It is **not** produced, endorsed, or supported by the OpenClaw Foundation,
and questions about it should not be directed to the upstream project.

## What was changed

The fork renames user-facing display text from "OpenClaw" to "OpenAgent", and
names Celaya Solutions as the maintaining organization. It deliberately does
**not** rename the technical surface, which remains upstream-compatible:

- the `openclaw` command and npm package names (`@openclaw/*`)
- the `~/.openclaw` state directory and `openclaw.json` configuration
- `OPENCLAW_*` environment variables
- identifiers, API shapes, and on-disk formats
- real filesystem paths and bundle names (`OpenClaw.app`, `OpenClaw.xcodeproj`,
  `OpenClaw.AppImage`) and the process name they run under

## License

This project is distributed under the MIT License; see [LICENSE](LICENSE). The
upstream copyright notice is reproduced above. Third-party notices for
incorporated or adapted code are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
