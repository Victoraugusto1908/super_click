import { describe, expect, mock, test } from "bun:test";

import type { ClickUpWebhookPayload } from "../types/clickup-webhook";
import { createApp } from "../index";
import { createClickUpWebhookHandler } from "../services/clickup-webhook";

function flushMicrotasks() {
  return new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });
}

describe("createApp", () => {
  test("returns 200 for GET /", async () => {
    const app = createApp();

    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Webhook service running");
  });

  test("returns 400 for invalid JSON", async () => {
    const app = createApp();

    const response = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Invalid JSON body",
    });
  });

  test("returns 400 when the JSON body is not an object", async () => {
    const app = createApp();

    const response = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(["not-an-object"]),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Invalid ClickUp webhook payload",
    });
  });

  test("returns 400 when required fields are missing", async () => {
    const app = createApp();

    const response = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        webhook_id: "wh_123",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      message: "Invalid ClickUp webhook payload",
    });
  });

  test("returns 200 for a valid ClickUp payload", async () => {
    const app = createApp();

    const response = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        event: "taskCreated",
        webhook_id: "wh_123",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      message: "Webhook received",
    });
  });

  test("returns 200 for a valid ClickUp automation payload", async () => {
    const app = createApp();

    const response = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        auto_id: "c389706e-3a5f-4230-a2aa-cdea3dc1e4cc:main",
        trigger_id: "40dd6192-91d7-4f3e-b55f-605297c77bb7",
        date: "2025-04-16T23:49:06.457Z",
        payload: {
          id: "868djdyr0",
          name: "HookMe!",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      message: "Webhook received",
    });
  });

  test("saves a valid ClickUp automation payload using the trigger id", async () => {
    let savedPayload: ClickUpWebhookPayload | undefined;
    const app = createApp({
      saveWebhookPayload: async (payload) => {
        savedPayload = payload;
      },
    });
    const payload = {
      auto_id: "c389706e-3a5f-4230-a2aa-cdea3dc1e4cc:main",
      trigger_id: "40dd6192-91d7-4f3e-b55f-605297c77bb7",
      date: "2025-04-16T23:49:06.457Z",
      payload: {
        id: "868djdyr0",
        name: "HookMe!",
      },
    };

    const response = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    expect(savedPayload).toEqual(payload);
  });

  test("forwards valid payloads to the webhook handler", async () => {
    let receivedPayload: ClickUpWebhookPayload | undefined;
    const app = createApp({
      handleClickUpWebhook: async (payload) => {
        receivedPayload = payload;
      },
    });
    const payload = {
      event: "taskCreated",
      webhook_id: "wh_123",
      task_id: "task_456",
    };

    const response = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    await flushMicrotasks();

    expect(response.status).toBe(200);
    expect(receivedPayload).toEqual(payload);
  });

  test("keeps returning 200 even when async processing fails", async () => {
    const originalConsoleError = console.error;
    const consoleError = mock(() => {});
    const app = createApp({
      handleClickUpWebhook: async () => {
        throw new Error("processing failed");
      },
    });

    console.error = consoleError;

    try {
      const response = await app.request("/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          event: "taskCreated",
          webhook_id: "wh_123",
        }),
      });

      await flushMicrotasks();

      expect(response.status).toBe(200);
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

describe("createClickUpWebhookHandler", () => {
  test("does nothing when the event is not relevant", async () => {
    const performClickUpFollowUpAction = mock(async () => {});
    const handleClickUpWebhook = createClickUpWebhookHandler({
      relevantEvents: ["taskStatusUpdated"],
      performClickUpFollowUpAction,
    });

    await handleClickUpWebhook({
      event: "taskCreated",
      webhook_id: "wh_123",
    });

    expect(performClickUpFollowUpAction).not.toHaveBeenCalled();
  });

  test("calls the follow-up action when the event is relevant", async () => {
    const performClickUpFollowUpAction = mock(async () => {});
    const handleClickUpWebhook = createClickUpWebhookHandler({
      relevantEvents: ["taskCreated"],
      performClickUpFollowUpAction,
    });
    const payload = {
      event: "taskCreated",
      webhook_id: "wh_123",
      task_id: "task_456",
    };

    await handleClickUpWebhook(payload);

    expect(performClickUpFollowUpAction).toHaveBeenCalledTimes(1);
    expect(performClickUpFollowUpAction).toHaveBeenCalledWith(payload);
  });
});
