# Batch state persisted to JSON checkpoint file, not AIS database

A 10-hour batch run must survive process crashes, network outages, and session restarts.

**Decision:** Batch state is persisted to a JSON file (`batch-checkpoint-{jobId}.json`) in the working directory. The file is written atomically (temp file + rename) after each worker completes. On restart, the dispatcher reads the checkpoint and resumes from where it left off.

**Considered Options:**
- **AIS SQLite database:** Already exists and could store batch state. Rejected because it couples the QoderWork skill to AIS internals, requires schema changes, and the skill shouldn't need write access to the app database for its own orchestration state.
- **In-memory only:** Simple but loses all progress on crash. Unacceptable for 10-hour runs.

A plain JSON file is the simplest durable store. It's human-readable, easy to inspect, easy to backup, and requires zero infrastructure. The atomic write pattern prevents corruption from mid-write crashes.

**Consequences:**
- The checkpoint file is the single source of truth for batch progress.
- Multiple sessions can resume the same batch by pointing at the same checkpoint file.
- The file format is simple enough that users can manually inspect or edit it if needed.
