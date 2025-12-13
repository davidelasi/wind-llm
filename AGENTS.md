# Repository Guidelines

## Project Structure & Module Organization
- Root docs in `docs/` (`PROJECT_OVERVIEW.md`, `TECHNICAL_TODOS.md`) explain architecture and roadmap.
- Web UI lives in `web-ui/` (Next.js App Router). App code under `web-ui/src/app`, shared libs in `web-ui/lib`, static assets in `web-ui/public`, config in `web-ui/config/model_config.json`.
- Data and prompts live under `data/` (raw/cleaned/training) with curated few-shot examples. Python data/forecast pipelines live in `scripts/` (`processing/`, `training/`, `analysis/`, `testing/`).
- `config/` holds runtime knobs for model behavior; avoid editing without understanding downstream effects.

## Build, Test, and Development Commands
- Install once: `cd web-ui && npm install`.
- Local dev server: `npm run dev` (Next.js with hot reload).
- Production build: `npm run build`; serve locally with `npm start`.
- Lint TypeScript/React: `npm run lint`.
- Data processing: `python3 scripts/processing/process_wind_data.py <input> [out_dir]` and `python3 scripts/processing/process_forecast_data.py <input> [out_dir]`.
- Training data generation: `python3 scripts/training/generate_training_data.py`; curate few-shot sets with `python3 scripts/training/curate_few_shot_examples.py`.
- Forecast validation: `python3 scripts/testing/test_2025_forecast.py 2025-07-15 --call-llm --anthropic-api-key <key>` (omit `--call-llm` for offline).

## Coding Style & Naming Conventions
- TypeScript/React: follow ESLint/Next defaults; 2-space indent; prefer functional components and server actions aligned with App Router conventions. Co-locate styles near components; keep filenames kebab- or lowerCamel-case (`wind-chart.tsx`).
- Python scripts: PEP 8 style, snake_case filenames/functions, type hints where practical. Keep CLI entrypoints slim and push logic into helpers.
- JSON/config: maintain trailing-newline, 2-space indent; document changes in comments nearby or README.

## Testing Guidelines
- Web UI: run `npm run lint` before pushing; add lightweight unit/logic tests if you introduce non-trivial helpers.
- Data pipeline: when modifying processing/training, run the corresponding script on a small sample from `data/raw/` and sanity-check outputs; for forecast behavior, use `scripts/testing/test_2025_forecast.py` on at least one date.
- Name new Python test files `test_*.py` and colocate with the module or under `scripts/testing/`.

## Commit & Pull Request Guidelines
- Commits: short, imperative summaries mirroring existing history (e.g., “Remove dummy forecast bars during loading”). Squash fixups locally before raising a PR.
- PRs: include a brief purpose paragraph, list of key changes, and steps to reproduce. Attach screenshots/GIFs for UI tweaks; paste `npm run lint` output and any script commands you ran. Link related issues/tasks and call out config or data migrations.

## Security & Configuration Tips
- Keep secrets (LLM keys, DB URLs) in `.env.local` or Vercel project settings; never commit them. Mask keys in logs.
- For production-like checks, ensure `config/model_config.json` and cache limits align with deployment expectations before enabling `--call-llm`.
