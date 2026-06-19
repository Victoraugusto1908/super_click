import { describe, expect, mock, test } from "bun:test";

import {
  createServiceCommissionTaskCommand,
  extractAddedTagNamesFromTaskUpdatedPayload,
} from "../commands/create-service-commission-task";
import {
  DESTINATION_COMMISSION_VALUE_FIELD_ID,
  DESTINATION_PAYMENT_PARTNER_FIELD_ID,
  FIRST_PAYMENT_DATE_FIELD_ID,
  PARTNER_FIELD_ID,
  REDE_SMART_PARTNER_OPTION_ID,
} from "../commands/partner-commission-task-shared";
import type { ClickUpTaskUpdatedWebhookPayload } from "../types/clickup-webhook";

const OTHER_PARTNER_OPTION_ID = "other-partner-option-id";

function createTaskUpdatedPayload(
  overrides: Partial<ClickUpTaskUpdatedWebhookPayload> = {},
): ClickUpTaskUpdatedWebhookPayload {
  return {
    event: "taskUpdated",
    webhook_id: "wh_123",
    task_id: "task_123",
    history_items: [
      {
        field: "tag",
        before: ["tributário"],
        after: ["tributário", "classificação"],
      },
    ],
    ...overrides,
  };
}

function createSourceTask(overrides?: {
  listId?: string;
  tags?: unknown[];
  partnerValue?: string | number;
}) {
  return {
    id: "task_123",
    name: "Victor Augusto LTDA",
    date_created: "1780695428760",
    list: {
      id: overrides?.listId ?? "source-list-123",
    },
    tags: overrides?.tags ?? [{ name: "classificação" }, { name: "tributário" }],
    custom_fields: [
      {
        id: "11a7f636-c49e-4423-b9d5-85fb4fc2fd52",
        value: "123",
      },
      {
        id: "14fb928b-77fe-4d9b-8979-93ebc14b5ec9",
        value: "Victor Tech LTDA",
      },
      {
        id: "50839e8d-bcdb-49fd-958d-1a4ee1987fa5",
        value: "ccad701a-fa27-4fb5-ab2c-29e7a13cd113",
      },
      {
        id: PARTNER_FIELD_ID,
        value: overrides?.partnerValue ?? 0,
        type_config: {
          options: [
            { id: REDE_SMART_PARTNER_OPTION_ID },
            { id: OTHER_PARTNER_OPTION_ID },
          ],
        },
      },
      {
        id: FIRST_PAYMENT_DATE_FIELD_ID,
        value: "1782802800000",
      },
      {
        id: "d4495e14-269b-48c0-a649-42fcc7427af8",
        value: [
          {
            id: 290658850,
            username: "Victor Augusto",
          },
        ],
      },
      {
        id: "fb911467-4b4e-468a-8769-e98be89594ff",
        value: "12.123.123/0001-00",
      },
    ],
  };
}

function createClickUpClientMock(options?: {
  sourceTask?: ReturnType<typeof createSourceTask>;
  createTaskIds?: string[];
}) {
  let createTaskIndex = 0;

  return {
    createTask: mock(async () => ({
      id: options?.createTaskIds?.[createTaskIndex++] ?? "created-task-123",
    })),
    getTask: mock(async () => options?.sourceTask ?? createSourceTask()),
    getAllTasksFromList: mock(async () => []),
    createTaskComment: mock(async () => {}),
    setCustomFieldValue: mock(async () => {}),
  };
}

describe("extractAddedTagNamesFromTaskUpdatedPayload", () => {
  test("extracts added tags from string arrays", () => {
    expect(
      extractAddedTagNamesFromTaskUpdatedPayload(
        createTaskUpdatedPayload({
          history_items: [
            {
              field: "tag",
              before: ["tributário"],
              after: ["tributário", "classificação"],
            },
          ],
        }),
      ),
    ).toEqual(["classificação"]);
  });

  test("extracts added tags from object arrays", () => {
    expect(
      extractAddedTagNamesFromTaskUpdatedPayload(
        createTaskUpdatedPayload({
          history_items: [
            {
              field: "tag",
              before: [{ name: "tributário" }],
              after: [{ name: "tributário" }, { name: "jurídico" }],
            },
          ],
        }),
      ),
    ).toEqual(["jurídico"]);
  });

  test("returns undefined when the tag diff format is unsupported", () => {
    expect(
      extractAddedTagNamesFromTaskUpdatedPayload(
        createTaskUpdatedPayload({
          history_items: [
            {
              field: "tag",
              before: "tributário",
              after: ["tributário", "classificação"],
            },
          ],
        }),
      ),
    ).toBeUndefined();
  });
});

describe("createServiceCommissionTaskCommand", () => {
  test("ignores tasks outside the configured NOVO_CLIENTE list", async () => {
    const logger = {
      log: mock(() => {}),
    };
    const clickUpClient = createClickUpClientMock({
      sourceTask: createSourceTask({
        listId: "another-list",
      }),
    });
    const command = createServiceCommissionTaskCommand({
      clickUpClient,
      logger,
      novoClienteListId: "source-list-123",
    });

    await command(createTaskUpdatedPayload(), ["classificação"]);

    expect(clickUpClient.getTask).toHaveBeenCalledTimes(1);
    expect(clickUpClient.createTask).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "Ignoring service commission webhook for task outside configured NOVO_CLIENTE list.",
      {
        taskId: "task_123",
        taskListId: "another-list",
        novoClienteListId: "source-list-123",
      },
    );
  });

  test("creates the destination task using the triggered tag only", async () => {
    const clickUpClient = createClickUpClientMock();
    const command = createServiceCommissionTaskCommand({
      assigneesList: "290658850, 123456789",
      clickUpClient,
      novoClienteListId: "source-list-123",
    });

    await command(createTaskUpdatedPayload(), ["classificação"]);

    expect(clickUpClient.getTask).toHaveBeenCalledTimes(1);
    expect(clickUpClient.getTask).toHaveBeenCalledWith("task_123");
    expect(clickUpClient.createTask).toHaveBeenCalledTimes(1);
    expect(clickUpClient.createTask).toHaveBeenCalledWith({
      name: "Victor Augusto LTDA",
      status: "pendente",
      customItemId: 1009,
      tags: ["classificação"],
      startDate: 1780695428760,
      dueDate: 1783234800000,
      priority: 2,
      assignees: [290658850, 123456789],
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: PARTNER_FIELD_ID,
      value: 0,
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: DESTINATION_PAYMENT_PARTNER_FIELD_ID,
      value: 1783666800000,
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
      value: "123",
    });
    expect(clickUpClient.createTaskComment).not.toHaveBeenCalled();
  });

  test("creates one task per added eligible tag and skips unsupported tags", async () => {
    const clickUpClient = createClickUpClientMock({
      createTaskIds: ["created-task-1", "created-task-2"],
    });
    const command = createServiceCommissionTaskCommand({
      assigneesList: "",
      clickUpClient,
      novoClienteListId: "source-list-123",
    });

    await command(createTaskUpdatedPayload(), [
      "classificação",
      "tributário",
      "jurídico",
    ]);

    expect(clickUpClient.createTask).toHaveBeenCalledTimes(2);
    expect(clickUpClient.createTask).toHaveBeenNthCalledWith(1, {
      name: "Victor Augusto LTDA",
      status: "pendente",
      customItemId: 1009,
      tags: ["classificação"],
      startDate: 1780695428760,
      dueDate: 1783234800000,
      priority: 2,
      assignees: undefined,
    });
    expect(clickUpClient.createTask).toHaveBeenNthCalledWith(2, {
      name: "Victor Augusto LTDA",
      status: "pendente",
      customItemId: 1009,
      tags: ["jurídico"],
      startDate: 1780695428760,
      dueDate: 1783234800000,
      priority: 2,
      assignees: undefined,
    });
  });
});
