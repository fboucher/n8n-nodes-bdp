# Local Docker Compose setup

The included [`compose.yml`](../compose.yml) runs a standalone n8n **2.44.4** instance with this checkout's BDP node already loaded. No npm publication, custom image, `.env` file, or separate sandbox service is required. This is a local testing setup, not a production deployment.

1. Install Git, **Node.js 22 or later with npm**, and **Docker Desktop with Linux containers** (or Docker Engine with the Compose v2 plugin on Linux). Start Docker before continuing.

2. Clone `dev`, install the locked dependencies, build, and start n8n. These commands work in PowerShell, macOS, and Linux terminals:

   ```sh
   git clone --branch dev https://github.com/fboucher/n8n-nodes-bdp.git
   cd n8n-nodes-bdp
   npm ci
   npm run build
   docker compose up -d --wait
   ```

   Run each command only after the previous one succeeds. If you already cloned the repo, run the last three commands from its root; do not clone again. `npm run dev` is **not** needed: it launches a separate development n8n process rather than configuring this container.

3. Open **http://localhost:5678**, create your local n8n owner account, and add a **Building Data Platform** node to a workflow. Building, Measurement Point, and GraphQL operations should all be available without installing another community package.

4. Create a **BDP Community OAuth2 API** credential inside n8n using your administrator-provided tenant ID, client ID, client secret, scope, and environment. For **GraphQL → Execute Query**, confirm GraphQL permission and fields in your environment's explorer. Credentials are not included in the repository; do not put them in Compose, source files, or Git.

5. To try the GraphQL examples, first prepare local copies for this custom-extension installation:

   ```sh
   node -e "const fs = require('node:fs'); fs.mkdirSync('.local/workflows', { recursive: true }); for (const name of ['graphql-nested-query.json', 'graphql-two-pages.json']) { const workflow = JSON.parse(fs.readFileSync('examples/' + name, 'utf8')); for (const node of workflow.nodes) { if (node.type === 'n8n-nodes-bdp.bdp') node.type = 'CUSTOM.bdp'; } fs.writeFileSync('.local/workflows/' + name, JSON.stringify(workflow, null, 2)); }"
   ```

   In n8n, use **Import from File** and select a generated file from `.local/workflows` in the checkout. Bind your credential and replace its synthetic IDs/query fields as needed. The GraphQL examples document their bounds and limitations in sticky notes. They are templates, not evidence that your environment supports every example field.

   n8n identifies bind-mounted custom nodes as `CUSTOM.bdp`, while a normally installed community package uses `n8n-nodes-bdp.bdp`. The command changes only the node type in ignored local copies; original public examples stay appropriate for package installations. Apply the same node-type adjustment to other imported workflows, or add a new Building Data Platform node through the editor.

The project-scoped Docker volume `n8n-bdp-dev_n8n-data` stores workflows, credentials, the encryption key, and the owner account across restarts. This is a **separate instance** from an existing setup such as `C:\dev\n8n`; existing credentials/workflows are not automatically copied. Keep the volume private and back it up before upgrades. Do not use `docker compose down --volumes` unless you deliberately want to delete that instance's data.

## Daily use

Run these commands from the repository root:

```sh
docker compose logs --tail 50 -f n8n
```

Press Ctrl+C to stop following logs; n8n keeps running. After changing node code, rebuild and reload it:

```sh
npm run build
docker compose restart n8n
```

Restart only when it is safe to interrupt executions. For dependency/lockfile changes, run `npm ci` before building. To stop the instance without deleting its data:

```sh
docker compose down
```

Start it again with `docker compose up -d --wait`. Keep the same checkout/project name to reuse the existing volume.

## Ports and startup troubleshooting

If port **5678** is already used by your existing n8n instance, select another host port before starting this setup. In **PowerShell**:

```powershell
$env:BDP_N8N_PORT = '5679'
docker compose up -d --wait
```

In **macOS/Linux shells**:

```sh
export BDP_N8N_PORT=5679
docker compose up -d --wait
```

Then open http://localhost:5679. Set the same variable in each new terminal before running Compose commands. The container still uses port 5678 internally. Stop an existing `npm run dev` process if you want to free port 5678 instead.

If startup fails, run `docker compose ps -a` and `docker compose logs --tail 100 n8n`. Missing bind paths or **Cannot find module 'graphql'** mean you should run `npm ci` and `npm run build` in the same checkout as `compose.yml`, then run `docker compose up -d --force-recreate --wait`. Allow Docker Desktop to share/access the checkout directory if prompted.

The compiled `dist` directory and the platform-independent `node_modules/graphql` package are mounted **read-only**, with `NODE_PATH` exposing the parser to the container. Mounting only `dist` is insufficient for Phase two. The rest of the checkout, including `.local/`, is not mounted. Installing the package archive normally is a separate supported route: npm then installs its runtime dependency automatically.

Only the editor's localhost port is published. Secure cookies are disabled solely for local HTTP; this configuration is not suitable for remote access or production. The image's built-in JavaScript runner is sufficient for these examples; a Python-runner warning does not affect the BDP node, and this setup does not provide Python execution or agent sandbox services. Use n8n's documented production hosting, TLS, backups, and external-runner configuration for a shared deployment.
