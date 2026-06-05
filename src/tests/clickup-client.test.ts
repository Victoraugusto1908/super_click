import { describe, expect, mock, test } from "bun:test";

import { createClickUpClient } from "../utils/clickup";

describe("createClickUpClient", () => {
  test("creates a task with the expected ClickUp payload", async () => {
    const fetchMock = mock(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe(
          "https://api.clickup.com/api/v2/list/list_123/task",
        );
        expect(init?.method).toBe("POST");
        expect(init?.headers instanceof Headers).toBe(true);
        expect((init?.headers as Headers).get("Authorization")).toBe(
          "test-api-key",
        );
        expect((init?.headers as Headers).get("Content-Type")).toBe(
          "application/json",
        );
        expect((init?.headers as Headers).get("accept")).toBe(
          "application/json",
        );
        expect(init?.body).toBe(
          JSON.stringify({
            name: "Victor Augusto LTDA",
            status: "a pagar",
            custom_item_id: 1009,
            tags: ["classificação", "conciliação"],
            start_date: 1780695428760,
            due_date: 1783234800000,
            priority: 2,
            assignees: [290658850, 123456789],
          }),
        );

        return new Response(
          JSON.stringify({
            id: "created-task-123",
            name: "Victor Augusto LTDA",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      },
    );
    const clickUpClient = createClickUpClient({
      apiKey: "test-api-key",
      destinationListId: "list_123",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const task = await clickUpClient.createTask({
      name: "Victor Augusto LTDA",
      status: "a pagar",
      customItemId: 1009,
      tags: ["classificação", "conciliação"],
      startDate: 1780695428760,
      dueDate: 1783234800000,
      priority: 2,
      assignees: [290658850, 123456789],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(task).toEqual({
      id: "created-task-123",
      name: "Victor Augusto LTDA",
    });
  });

  test("updates a custom field in a separate request", async () => {
    const fetchMock = mock(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe(
          "https://api.clickup.com/api/v2/task/task_123/field/field_456",
        );
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(
          JSON.stringify({
            value: [290658850],
          }),
        );

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    );
    const clickUpClient = createClickUpClient({
      apiKey: "test-api-key",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await clickUpClient.setCustomFieldValue({
      taskId: "task_123",
      fieldId: "field_456",
      value: [290658850],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("serializes value_options when updating a relationship field", async () => {
    const fetchMock = mock(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe(
          "https://api.clickup.com/api/v2/task/task_123/field/field_456",
        );
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(
          JSON.stringify({
            value: "source-task-789",
            value_options: {
              add: ["source-task-789"],
            },
          }),
        );

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    );
    const clickUpClient = createClickUpClient({
      apiKey: "test-api-key",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await clickUpClient.setCustomFieldValue({
      taskId: "task_123",
      fieldId: "field_456",
      value: "source-task-789",
      valueOptions: {
        add: ["source-task-789"],
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("serializes the seller people field with value.add", async () => {
    const fetchMock = mock(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe(
          "https://api.clickup.com/api/v2/task/task_123/field/ec16180c-8ece-4a86-8d8d-4cfc9965fbd1",
        );
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(
          JSON.stringify({
            value: {
              add: [12345678],
            },
          }),
        );

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    );
    const clickUpClient = createClickUpClient({
      apiKey: "test-api-key",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await clickUpClient.setCustomFieldValue({
      taskId: "task_123",
      fieldId: "ec16180c-8ece-4a86-8d8d-4cfc9965fbd1",
      value: {
        add: [12345678],
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("throws when the ClickUp API returns an error", async () => {
    const clickUpClient = createClickUpClient({
      apiKey: "test-api-key",
      destinationListId: "list_123",
      fetch: mock(async () => {
        return new Response("bad request", {
          status: 400,
          statusText: "Bad Request",
        });
      }) as unknown as typeof fetch,
    });

    await expect(
      clickUpClient.createTask({
        listId: "list_123",
        name: "Victor Augusto LTDA",
      }),
    ).rejects.toThrow(
      "ClickUp request failed (400 Bad Request): bad request",
    );
  });

  test("throws when no destination list is configured", async () => {
    const clickUpClient = createClickUpClient({
      apiKey: "test-api-key",
      destinationListId: "",
      fetch: mock(async () => {
        throw new Error("fetch should not be called");
      }) as unknown as typeof fetch,
    });

    await expect(
      clickUpClient.createTask({
        name: "Victor Augusto LTDA",
      }),
    ).rejects.toThrow("DESTINY_LIST is not configured");
  });
});
