# Example workflows

Choose the folder that matches how you loaded the Building Data Platform node:

- **[local](local/)**: use with the [local Docker Compose setup](../docs/docker-compose.md). The node is loaded from this checkout; no published npm package is needed.
- **[npm](npm/)**: use when the `n8n-nodes-bdp` community package is installed in n8n. The package must first be available to install.

The folders contain the same workflows:

- **buildings-floors-spaces** lists buildings, their floors, and spaces (rooms).
- **building-history-three-days** reads the last three days of one building's history.
- **building-history** reads one building's history daily.
- **phase-one-scheduled-extraction** reads one measurement point's history daily.

In n8n, use **Import from File**, choose a JSON file from the appropriate folder, and follow its sticky notes to select your BDP credential and configure the nodes. Activate a scheduled workflow only after setup.
