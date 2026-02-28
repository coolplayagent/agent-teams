from pathlib import Path
import sqlite3
import json

db_path = r"d:\workspace\agent_teams\.agent_teams\agent_teams.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

# Get tasks mapped by session_id
cursor = conn.execute("""
    SELECT DISTINCT t.session_id, t.task_id 
    FROM tasks t
""")
rows = cursor.fetchall()

print(f"Total tasks: {len(rows)}")

# Get workflow graphs
cursor = conn.execute("""
    SELECT scope_id, value_json
    FROM shared_state
    WHERE state_key = 'workflow_graph'
""")
graphs = cursor.fetchall()
print(f"Total Workflow Graphs: {len(graphs)}")

for row in graphs[:2]:
    print(f"Workflow from task {row['scope_id']}:")
    print(json.dumps(json.loads(row['value_json']), indent=2))
