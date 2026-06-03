## AgentBench Reports

Archived benchmark reports from `.agent_teams/benchmarks/results/agentbench/2026-05-26__00-38-21`.

| Suite | Pass Rate | Passed | Failed | Mean Duration | Input Tokens | Cached Input | Output Tokens | Requests | Tool Calls | Report | Summary |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| AgentBench OS | 41.0% | 59 | 85 | 23.9s | 5,665,302 | 5,220,736 | 254,361 | 1,217 | 249 | [HTML](./agentbench-os-report.html) | [JSON](./agentbench-os-summary.json) |
| AgentBench DB | 73.7% | 221 | 79 | 21.1s | 8,850,453 | 7,550,080 | 469,910 | 1,906 | 65 | [HTML](./agentbench-db-report.html) | [JSON](./agentbench-db-summary.json) |

Notes:

- The source run contains 444 AgentBench items: 144 OS tasks and 300 DB tasks.
- All items in this archived run completed at the harness level; failed counts are agent-scored task failures.
- Token counts are copied from the benchmark result payload and include cached input tokens when reported.
