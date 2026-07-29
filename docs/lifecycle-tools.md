# Repeatable lifecycle tools

The server persists local lifecycle records under its configured data directory in
`lifecycle-tasks.json`. IDs are prefixed `nlm-local-research-` or
`nlm-local-studio-`; they are local correlation IDs and are never presented as
NotebookLM remote task IDs.

- `list_sources` / `get_source` read source titles and URLs observed in the live
  NotebookLM DOM. `retry_source` performs bounded retries and returns failure
  class, retryability, attempts, and next steps.
- `update_source` and `remove_source` currently return `unsupported` with UI
  recovery steps. They do not claim a mutation occurred.
- `create_research_task`, `get_research_task`, and `list_research_tasks` persist
  research requests and accept only observed DOM markers as progress. Results
  and source import remain incomplete until the corresponding UI evidence is
  available.
- `create_studio_task`, `get_studio_task`, and `list_studio_tasks` preserve
  prompt, detail level, slide count, expected/actual source counts, and selected
  source titles/counts. Audio Overview remains the verified Studio flow.
  Presentation/slide-deck creation/download returns explicit `incomplete`
  state until stable selectors and artifact evidence are implemented.
