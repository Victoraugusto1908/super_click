import { Hono } from "hono";

import type { ClickUpWebhookPayload } from "./types/clickup-webhook";
import { createWebhookRouter } from "./routes/webhook";
import type { ClickUpWebhookHandler } from "./services/clickup-webhook";

type AppDependencies = {
  handleClickUpWebhook?: ClickUpWebhookHandler;
  saveWebhookPayload?: (payload: ClickUpWebhookPayload) => Promise<void>;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono();

  app.get("/", (c) => c.text("Webhook service running"));
  app.route("/", createWebhookRouter(dependencies));

  return app;
}

const app = createApp();

if (import.meta.main) {
  const port = Number(Bun.env.PORT ?? 3000);

  Bun.serve({
    fetch: app.fetch,
    port,
  });

  console.log(`Webhook service running on port ${port}`);
}
