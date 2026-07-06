# QoderWork Skills Installation Guide

This project includes QoderWork agent skills that enable AI-assisted batch image generation through the AIS CLI. This guide walks you through installing these skills on your local machine.

## What Are QoderWork Skills?

QoderWork skills are structured instruction sets (markdown documents) that teach the QoderWork AI agent how to perform specific tasks. They live in `~/.qoderwork/skills/<skill-name>/` on your machine and are automatically discovered by QoderWork when you invoke related commands.

The `batch-image-gen` skill in this project orchestrates batch image generation pipelines: parsing natural language task descriptions, dispatching parallel workers for image generation + QA evaluation, and managing retries with file-based checkpoints.

## Skill Inventory

| Skill | Files | Description |
|-------|-------|-------------|
| `batch-image-gen` | `SKILL.md`, `worker-sop.md`, `qa-rubrics.md` | Batch image generation pipeline with parallel dispatch, VLM-based QA, and checkpoint resume |

## Prerequisites

- **QoderWork** (Qoder desktop app) installed and running
- This repository cloned to your local machine

## Installation

### Option A: Automated (Recommended)

Run the install script from the project root:

**Windows (Command Prompt / PowerShell):**
```bat
scripts\install-skills.bat
```

**macOS / Linux:**
```bash
bash scripts/install-skills.sh
```

### Option B: Manual

The skill files are stored in the repository at `.qoderwork/skills/batch-image-gen/`. Copy them to your QoderWork skills directory:

**Windows:**
```bat
xcopy /E /I /Y ".qoderwork\skills\batch-image-gen" "%USERPROFILE%\.qoderwork\skills\batch-image-gen"
```

**macOS / Linux:**
```bash
mkdir -p ~/.qoderwork/skills/batch-image-gen
cp -r .qoderwork/skills/batch-image-gen/* ~/.qoderwork/skills/batch-image-gen/
```

## Verify Installation

After installing, verify the skill is in place:

**Windows:**
```bat
dir "%USERPROFILE%\.qoderwork\skills\batch-image-gen"
```
You should see: `SKILL.md`, `worker-sop.md`, `qa-rubrics.md`

**macOS / Linux:**
```bash
ls ~/.qoderwork/skills/batch-image-gen/
```
Expected output: `SKILL.md  qa-rubrics.md  worker-sop.md`

Then test in QoderWork by typing a batch generation request like:
> "Generate 3 images: a sunset, a mountain, and a forest, all in watercolor style"

QoderWork should automatically pick up the `batch-image-gen` skill and follow its workflow.

## Keeping Skills in Sync

### Repo → Local (pull updates)

When the team updates skills in the repo, re-run the install script or manually copy:

```bash
# macOS / Linux
cp -r .qoderwork/skills/batch-image-gen/* ~/.qoderwork/skills/batch-image-gen/

# Windows
xcopy /E /I /Y ".qoderwork\skills\batch-image-gen" "%USERPROFILE%\.qoderwork\skills\batch-image-gen"
```

### Local → Repo (push your improvements)

If you improve a skill locally and want to contribute it back:

```bash
# macOS / Linux
cp ~/.qoderwork/skills/batch-image-gen/* .qoderwork/skills/batch-image-gen/

# Windows
xcopy /E /I /Y "%USERPROFILE%\.qoderwork\skills\batch-image-gen" ".qoderwork\skills\batch-image-gen"
```

Then commit and push as usual.

## Directory Structure

```
image_test/                         # Project root
├── .qoderwork/
│   └── skills/
│       └── batch-image-gen/        # ← Skills stored in repo
│           ├── SKILL.md            # Dispatcher workflow (entry point)
│           ├── worker-sop.md       # Worker execution SOP
│           └── qa-rubrics.md       # VLM evaluation rubrics
├── app/                            # Application source code
├── docs/                           # Documentation
│   └── QODERWORK-SKILLS.md         # ← This file
└── scripts/
    ├── install-skills.sh           # Linux/macOS install script
    └── install-skills.bat          # Windows install script
```

## Troubleshooting

**Q: QoderWork doesn't pick up the skill after installation.**
A: Restart QoderWork. Skills are loaded at session start.

**Q: The skill references hardcoded paths that don't match my setup.**
A: The skill currently contains paths specific to the original developer's environment (`C:\Users\83871\...`). You'll need to update the paths in `SKILL.md` and `worker-sop.md` to match your local AIS project path. Look for the `AIS Project Root` and `QoderWork Workspace` sections in SKILL.md.

**Q: How do I add a new skill?**
A: Create a new directory under `.qoderwork/skills/` with at least a `SKILL.md` file containing YAML frontmatter (name, description, version). See the [QoderWork skill authoring guide](https://docs.qoder.com) for the full specification.
