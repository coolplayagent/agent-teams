# SWE-bench Reports

Archived benchmark reports:

These snapshots currently cover the first `100` items from `SWE-bench Verified`.

## Existing Snapshots

Previously archived reports are kept under their original filenames:

- [Normal mode, SWE-bench Verified 100](./normal-swebench-verified-100-report.html)
- [Orchestration mode, SWE-bench Verified 100](./orchestration-swebench-verified-100-report.html)

## DeepSeek v4 flash

Updated: `2026-06-08`

Model id: `deepseek-v4-flash`

Run context:

- Dataset: `.agent_teams/evals/datasets/swebench-verified-100.jsonl`
- Scorer: `swebench_docker`
- Backend: `agent_teams`
- Workspace mode: `docker`
- Timeout: `600s` per item

| Mode | Report | Passed | Pass rate | Outcomes | Completed + PASS | Failed + PASS | Mean duration | P95 duration | Requests | Tool calls | Est. cost |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal | [HTML](./deepseek-v4-flash-normal-swebench-verified-100-report.html) | 71/100 | 71.0% | completed=99, failed=1 | 70 | 1 | 316.1s | 697.7s | 1,900 | 968 | $59.38 |
| Orchestration | [HTML](./deepseek-v4-flash-orchestration-swebench-verified-100-report.html) | 72/100 | 72.0% | completed=58, failed=42 | 43 | 29 | 379.4s | 942.8s | 7,729 | 4,416 | $185.01 |

Notes:

- `Passed` is the SWE-bench Docker scorer result, derived from the benchmark `resolved` value.
- `Outcome` is the agent runtime lifecycle status. In orchestration mode, a run can have `outcome=failed` while still passing SWE-bench when the patch resolves the tests but orchestration postcondition verification fails.
