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
- `create_research_task`, `get_research_task`, and `list_research_tasks` are
  live-backed when a browser session can be initialized. Creation requires a
  visible Research prompt and submit control, and returns `running` only after
  a live DOM progress marker is observed. Report text/source extraction remains
  `incomplete` because no reliable result selector is verified.
- `create_studio_task`, `get_studio_task`, and `list_studio_tasks` preserve
  prompt, detail level, slide count, expected/actual source counts, and selected
  source titles/counts. Audio Overview creation/status/download are live-backed
  through the verified session/page selectors and download event. Presentation
  and slide-deck creation/download remain explicit `incomplete`; no card is
  selected without robust title/source-count/task scoping.
- A local task ID is never a NotebookLM remote ID. Session initialization or
  missing UI evidence is returned as an error/incomplete result with next steps;
  it is never reported as a successful external task.
