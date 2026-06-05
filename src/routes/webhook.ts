import { Hono } from "hono";

import {
  isClickUpApiWebhookPayload,
  isClickUpAutomationWebhookPayload,
  isClickUpWebhookPayload,
  type ClickUpWebhookPayload,
} from "../types/clickup-webhook";
import {
  handleClickUpWebhook as defaultHandleClickUpWebhook,
  type ClickUpWebhookHandler,
} from "../services/clickup-webhook";

type WebhookRouteDependencies = {
  handleClickUpWebhook?: ClickUpWebhookHandler;
  saveWebhookPayload?: (payload: ClickUpWebhookPayload) => Promise<void>;
};

async function saveWebhookPayloadToFile(
  payload: ClickUpWebhookPayload,
): Promise<void> {
  if (!isClickUpAutomationWebhookPayload(payload)) {
    return;
  }

  await Bun.write(
    `logs/${payload.payload.id}.json`,
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

function logWebhookProcessingError(
  payload: ClickUpWebhookPayload,
  error: unknown,
) {
  const context = isClickUpApiWebhookPayload(payload)
    ? {
        event: payload.event,
        webhookId: payload.webhook_id,
      }
    : {
        automationId: payload.auto_id,
        triggerId: payload.trigger_id,
      };

  console.error("Failed to process ClickUp webhook", {
    error,
    ...context,
  });
}

export function createWebhookRouter(
  dependencies: WebhookRouteDependencies = {},
) {
  const router = new Hono();
  const handleClickUpWebhook =
    dependencies.handleClickUpWebhook ?? defaultHandleClickUpWebhook;
  const saveWebhookPayload =
    dependencies.saveWebhookPayload ?? saveWebhookPayloadToFile;

  router.post("/webhook", async (c) => {
    let payload: unknown;

    try {
      payload = await c.req.json();
    } catch {
      console.log("Invalid JSON body");
      return c.json(
        {
          ok: false,
          message: "Invalid JSON body",
        },
        400,
      );
    }

    if (!isClickUpWebhookPayload(payload)) {
      console.log("Invalid ClickUp webhook payload");
      console.log(payload);
      return c.json(
        {
          ok: false,
          message: "Invalid ClickUp webhook payload",
        },
        400,
      );
    }

    console.log("Disparando mensagem em segundo plano.");
    queueMicrotask(() => {
      void saveWebhookPayload(payload).catch((error) => {
        logWebhookProcessingError(payload, error);
      });

      void handleClickUpWebhook(payload).catch((error) => {
        logWebhookProcessingError(payload, error);
      });
    });

    return c.json({
      ok: true,
      message: "Webhook received",
    });
  });

  return router;
}

export const webhookRoute = createWebhookRouter();
