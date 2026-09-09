// HTTP entry point for hosted deployment: balance sync + bank connections.
import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { config, setupProblems, tlsOptions } from "./config.ts";
import { createApp } from "./app.ts";
import { applyKnownSessionLabels } from "./labels.ts";
import { setupAvailable } from "./setup.ts";

applyKnownSessionLabels();
const app = createApp();
const tls = tlsOptions();
const httpServer = tls ? createHttpsServer(tls, app) : createHttpServer(app);
httpServer.listen(config.port, () => {
  console.log(`[bank ${new Date().toISOString()}] listening on ${tls ? "https" : "http"}://0.0.0.0:${config.port}, public URL ${config.baseUrl}`);
  const problems = setupProblems();
  if (problems.length) console.log(`[bank] ${setupAvailable() ? `not configured yet: open ${config.baseUrl} to finish setup` : "not configured:"}`, problems);
});
