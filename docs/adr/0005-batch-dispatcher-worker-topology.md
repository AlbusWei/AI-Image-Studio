# Batch skill uses Dispatcher-Worker topology with greedy parallel scheduling

The batch-image-gen skill needs to generate hundreds of images over 10+ hours without human supervision.

**Decision:** The skill uses a Dispatcher-Worker architecture. The main agent acts as a stateless scheduler, maintaining a checkpoint file and dispatching sub-agent workers. Each worker executes one image's full pipeline (expand → gen → QA → retry). Workers are spawned in parallel up to a concurrency limit (default 2). When a worker slot opens, the dispatcher immediately fills it — greedy scheduling maximizes pipeline utilization and idle-resource usage.

**Considered Options:**
- **Serial queue:** Simple but wastes time — only one image generates at a time while the API could handle more.
- **Phased batch:** All images expand, then all generate, then all QA. Wastes time waiting for the slowest image in each phase.

Serial and phased both leave resources idle for most of a 10-hour run. Greedy dispatch keeps workers busy and adapts to variable generation times.

**Consequences:**
- The dispatcher never does generation work itself — it only plans, dispatches, tracks, and reports.
- Each worker is a full sub-agent with access to the AIS CLI, VLM evaluation, and retry logic.
- Concurrency is model-aware: different models may have different parallel limits.
- If a worker crashes, the dispatcher can re-dispatch from the checkpoint — workers are stateless.
