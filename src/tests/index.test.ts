import { describe, expect, mock, test } from "bun:test";

import { createApp } from "../index";
import {
  createClickUpWebhookHandler,
  getAutomationSourceListId,
} from "../services/clickup-webhook";
import type { ClickUpWebhookPayload } from "../types/clickup-webhook";

function flushAsyncWork() {
  return new Promise<void>((resolve) => {
    queueMicrotask(() => {
      void Promise.resolve().then(() => resolve());
    });
  });
}

function createAutomationPayload(
  overrides: Partial<Extract<ClickUpWebhookPayload, { auto_id: string }>> = {},
) {
  return {
    auto_id: "auto_123",
    trigger_id: "trigger_123",
    date: "2026-06-05T18:42:20.382Z",
    payload: {
      id: "task_123",
      name: "Victor Augusto LTDA",
      subcategory: "source-list-123",
      lists: [
        {
          list_id: "source-list-123",
          type: "home",
        },
      ],
      fields: [],
    },
    ...overrides,
  } satisfies ClickUpWebhookPayload;
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
    const app = createApp({
      saveWebhookPayload: async () => {},
    });

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
    const app = createApp({
      saveWebhookPayload: async () => {},
    });

    const response = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(createAutomationPayload()),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      message: "Webhook received",
    });
  });

  test("saves a valid ClickUp automation payload asynchronously", async () => {
    let savedPayload: ClickUpWebhookPayload | undefined;
    const app = createApp({
      saveWebhookPayload: async (payload) => {
        savedPayload = payload;
      },
      handleClickUpWebhook: async () => {},
    });
    const payload = createAutomationPayload();

    const response = await app.request("/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    await flushAsyncWork();

    expect(response.status).toBe(200);
    expect(savedPayload).toEqual(payload);
  });

  test("forwards valid payloads to the webhook handler", async () => {
    let receivedPayload: ClickUpWebhookPayload | undefined;
    const app = createApp({
      saveWebhookPayload: async () => {},
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

    await flushAsyncWork();

    expect(response.status).toBe(200);
    expect(receivedPayload).toEqual(payload);
  });

  test("keeps returning 200 even when async processing fails", async () => {
    const originalConsoleError = console.error;
    const consoleError = mock(() => {});
    const app = createApp({
      saveWebhookPayload: async () => {},
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

      await flushAsyncWork();

      expect(response.status).toBe(200);
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

describe("createClickUpWebhookHandler", () => {
  test("ignores non-automation payloads", async () => {
    const command = mock(async () => {});
    const handleClickUpWebhook = createClickUpWebhookHandler({
      commandsBySourceListId: {
        "source-list-123": command,
      },
    });

    await handleClickUpWebhook({
      event: "taskCreated",
      webhook_id: "wh_123",
    });

    expect(command).not.toHaveBeenCalled();
  });

  test("dispatches automation payloads using the source list id", async () => {
    const command = mock(async () => {});
    const handleClickUpWebhook = createClickUpWebhookHandler({
      commandsBySourceListId: {
        "source-list-123": command,
      },
    });
    const payload = createAutomationPayload();

    await handleClickUpWebhook(payload);

    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith(payload);
  });

  test("falls back to the first list when subcategory is missing", () => {
    const payload = createAutomationPayload({
      payload: {
        id: "task_123",
        name: "Victor Augusto LTDA",
        subcategory: null,
        lists: [
          {
            list_id: "fallback-list-456",
            type: "home",
          },
        ],
        fields: [],
      },
    });

    expect(getAutomationSourceListId(payload)).toBe("fallback-list-456");
  });

  test("does nothing when there is no command for the source list", async () => {
    const command = mock(async () => {});
    const handleClickUpWebhook = createClickUpWebhookHandler({
      commandsBySourceListId: {
        "another-list": command,
      },
    });

    await handleClickUpWebhook(createAutomationPayload());

    expect(command).not.toHaveBeenCalled();
  });

  test("warns when NOVO_CLIENTE is not configured", async () => {
    const logger = {
      warn: mock(() => {}),
    };
    const handleClickUpWebhook = createClickUpWebhookHandler({
      logger,
      novoClienteListId: "",
    });

    await handleClickUpWebhook(createAutomationPayload());

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "NOVO_CLIENTE is not configured; skipping webhook command registration.",
    );
  });
});
