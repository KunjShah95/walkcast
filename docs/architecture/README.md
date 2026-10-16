# Architecture diagrams

Four editable [Excalidraw](https://excalidraw.com) diagrams of Walkcast. To edit one, open
excalidraw.com and drag the `.excalidraw` file onto the canvas (or use Menu → Open). The
`preview/` folder has SVG versions you can view without Excalidraw; they are drawn by
`build.py`, not by Excalidraw itself, so the font and arrow rendering only approximate it.

| File | What it answers |
| --- | --- |
| [`01-architecture-overview.excalidraw`](01-architecture-overview.excalidraw) | Who uses Walkcast, the containers (edge, web tier, Postgres, object storage, worker fleet) and the external systems, plus the three deployment modes: local, Vercel and AWS. |
| [`02-system-design.excalidraw`](02-system-design.excalidraw) | One recording, end to end, as a sequence: submit → quota → atomic enqueue → poll → claim → heartbeat → record → encode → publish → index → fenced finish → presigned playback. Also the job state machine and how each failure is handled. |
| [`03-hld.excalidraw`](03-hld.excalidraw) | High-level design: five layers (clients, edge & web, domain services, state adapters, external) and the module behind every component. |
| [`04-lld.excalidraw`](04-lld.excalidraw) | Low-level design: the Postgres schema and indexes, the `Store` / `MediaStore` interfaces and the `Worker` class, and the `recordSite()` and `runOnce()` pipelines step by step. |

## Keeping them current

The diagrams are generated from `build.py`, which places every box and arrow by hand. Every label
names real code: modules under `src/`, routes in `src/ui/server.ts`, and tables in
`supabase/migrations/`. When that code changes, edit the layout in `build.py` and regenerate
rather than editing the JSON by hand, so the four files stay consistent:

```sh
python docs/architecture/build.py
```

The script prints a `WARN` line for any label that is likely to overflow its box.

Related prose: [`../SYSTEM-DESIGN.md`](../SYSTEM-DESIGN.md) (correctness guarantees),
[`../SCALING.md`](../SCALING.md) (capacity and worker scaling),
[`../DEPLOY-AWS.md`](../DEPLOY-AWS.md) (production topology).
