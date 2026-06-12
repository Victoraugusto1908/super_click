import { describe, expect, mock, test } from "bun:test";

import { createCompesacaoTaskCommand } from "../commands/create-compesacao-task";
import {
  COMMISSION_RULE_FIELD_ID,
  DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID,
  PARTNER_FIELD_ID,
} from "../commands/link-partner-relationship";
import {
  DESTINATION_CNPJ_FIELD_ID,
  DESTINATION_CLIENT_RELATIONSHIP_FIELD_ID,
  DESTINATION_PAYMENT_PARTNER_FIELD_ID,
  DESTINATION_RAZAO_SOCIAL_FIELD_ID,
  FIRST_PAYMENT_DATE_FIELD_ID,
} from "../commands/partner-commission-task-shared";
import type { ClickUpTaskUpdatedWebhookPayload } from "../types/clickup-webhook";

const RELATED_CLIENT_FIELD_ID = "49414079-b1ff-4644-ac85-71a5448424cc";
const COMPESACAO_LIST_ID = "compesacao-list-123";
const CLIENT_TASK_ID = "client-task-123";
const RELATED_TASK_ID = "related-task-456";
const SOURCE_TASK_ID = "comp-task-123";
const PRIMARY_ACTION_FIELD_ID = "af361038-0079-4975-8de0-a8dbe409be76";
const PRIMARY_ACTION_OPTION_ID = "c2b7e40d-516b-4986-be35-3fcef5f99cef";
const PRIMARY_VALUE_FIELD_ID = "45128f22-7712-4fd1-8ee9-fb6fb6ffa08e";
const SECONDARY_VALUE_FIELD_ID = "dfaa24a8-0c61-4461-9e69-8aa2c74bc0f9";

function createTaskUpdatedPayload(
  overrides: Partial<ClickUpTaskUpdatedWebhookPayload> = {},
): ClickUpTaskUpdatedWebhookPayload {
  return {
    event: "taskUpdated",
    webhook_id: "wh_123",
    task_id: SOURCE_TASK_ID,
    history_items: [
      {
        field: "custom_field",
        before: "ae4830ad-26c7-4b2a-9300-c448d38b5d98",
        after: PRIMARY_ACTION_OPTION_ID,
        custom_field: {
          id: PRIMARY_ACTION_FIELD_ID,
        },
      },
    ],
    ...overrides,
  };
}

function createSourceTask(overrides?: {
  customFields?: { id: string; value: unknown }[];
  linkedTasks?: { task_id: string; link_id?: string }[];
  listId?: string;
}) {
  const defaultCustomFields = [
    {
      id: "14fb928b-77fe-4d9b-8979-93ebc14b5ec9",
      value: "VICTOR ILIMITADO\n",
    },
    {
      id: "fb911467-4b4e-468a-8769-e98be89594ff",
      value: "12.123.123/0001-00",
    },
    {
      id: PRIMARY_VALUE_FIELD_ID,
      value: "1500000",
    },
    {
      id: SECONDARY_VALUE_FIELD_ID,
      value: "2750000",
    },
  ];
  const overrideFieldIds = new Set(
    overrides?.customFields?.map((field) => field.id) ?? [],
  );

  return {
    id: SOURCE_TASK_ID,
    name: "Victor ilimitado",
    list: {
      id: overrides?.listId ?? COMPESACAO_LIST_ID,
    },
    linked_tasks: overrides?.linkedTasks ?? [
      { task_id: SOURCE_TASK_ID, link_id: RELATED_TASK_ID },
    ],
    custom_fields: [
      ...defaultCustomFields.filter((field) => !overrideFieldIds.has(field.id)),
      ...(overrides?.customFields ?? []),
    ],
  };
}

function createRelatedTask() {
  return {
    id: RELATED_TASK_ID,
    custom_fields: [
      {
        id: RELATED_CLIENT_FIELD_ID,
        value: [
          {
            id: CLIENT_TASK_ID,
            name: "VICTOR TECH LTDA",
          },
        ],
      },
    ],
  };
}

function createClientTask() {
  return {
    id: CLIENT_TASK_ID,
    name: "VICTOR TECH LTDA",
    date_created: "1780695428760",
    tags: [{ name: "classificação" }, { name: "conciliação" }],
    custom_fields: [
      {
        id: "11a7f636-c49e-4423-b9d5-85fb4fc2fd52",
        value: "123",
      },
      {
        id: "50839e8d-bcdb-49fd-958d-1a4ee1987fa5",
        value: "ccad701a-fa27-4fb5-ab2c-29e7a13cd113",
      },
      {
        id: PARTNER_FIELD_ID,
        value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
      },
      {
        id: FIRST_PAYMENT_DATE_FIELD_ID,
        value: "1782802800000",
      },
      {
        id: "14fb928b-77fe-4d9b-8979-93ebc14b5ec9",
        value: "VICTOR TECH LTDA",
      },
      {
        id: "fb911467-4b4e-468a-8769-e98be89594ff",
        value: "99.999.999/0001-99",
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
    ],
  };
}

function createPartnerTask(overrides?: { commissionRule?: string | undefined }) {
  return {
    id: "partner-task-1",
    custom_fields: [
      {
        id: PARTNER_FIELD_ID,
        value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
      },
      ...(overrides?.commissionRule === undefined
        ? []
        : [
            {
              id: COMMISSION_RULE_FIELD_ID,
              value: overrides.commissionRule,
            },
          ]),
    ],
  };
}

describe("createCompesacaoTaskCommand", () => {
  test("creates the destination task using client-base fields and compensation overrides", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "created-task-123" })),
      getTask: mock(async (taskId: string) => {
        if (taskId === SOURCE_TASK_ID) {
          return createSourceTask();
        }

        if (taskId === RELATED_TASK_ID) {
          return createRelatedTask();
        }

        if (taskId === CLIENT_TASK_ID) {
          return createClientTask();
        }

        throw new Error(`Unexpected task lookup: ${taskId}`);
      }),
      getAllTasksFromList: mock(async () => [
        createPartnerTask({ commissionRule: "Teste\n" }),
      ]),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createCompesacaoTaskCommand({
      clickUpClient,
      assigneesList: "290658850, 123456789",
      compesacaoListId: COMPESACAO_LIST_ID,
      now: () => 1780000000000,
      partnersListId: "partners-list-123",
    });

    await command(createTaskUpdatedPayload());

    expect(clickUpClient.getTask).toHaveBeenNthCalledWith(1, SOURCE_TASK_ID);
    expect(clickUpClient.getTask).toHaveBeenNthCalledWith(2, RELATED_TASK_ID);
    expect(clickUpClient.getTask).toHaveBeenNthCalledWith(3, CLIENT_TASK_ID);
    expect(clickUpClient.createTask).toHaveBeenCalledWith({
      name: "VICTOR TECH LTDA",
      status: "pendente",
      customItemId: 1009,
      tags: ["classificação", "conciliação"],
      startDate: 1780695428760,
      dueDate: 1783234800000,
      priority: 2,
      assignees: [290658850, 123456789],
    });
    expect(clickUpClient.createTaskComment).not.toHaveBeenCalled();
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: "11a7f636-c49e-4423-b9d5-85fb4fc2fd52",
      value: "123",
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: "50839e8d-bcdb-49fd-958d-1a4ee1987fa5",
      value: "ccad701a-fa27-4fb5-ab2c-29e7a13cd113",
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: PARTNER_FIELD_ID,
      value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: FIRST_PAYMENT_DATE_FIELD_ID,
      value: "1782802800000",
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
      fieldId: "ec16180c-8ece-4a86-8d8d-4cfc9965fbd1",
      value: {
        add: [290658850],
      },
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: DESTINATION_CLIENT_RELATIONSHIP_FIELD_ID,
      value: {
        add: [CLIENT_TASK_ID],
      },
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: DESTINATION_RAZAO_SOCIAL_FIELD_ID,
      value: "VICTOR ILIMITADO\n",
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: DESTINATION_CNPJ_FIELD_ID,
      value: "12.123.123/0001-00",
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID,
      value: {
        add: ["partner-task-1"],
      },
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: COMMISSION_RULE_FIELD_ID,
      value: "Teste\n",
      valueOptions: undefined,
    });
  });

  test("skips Data Pagamento Parceiro when the client has no first payment date", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "created-task-123" })),
      getTask: mock(async (taskId: string) => {
        if (taskId === SOURCE_TASK_ID) {
          return createSourceTask();
        }

        if (taskId === RELATED_TASK_ID) {
          return createRelatedTask();
        }

        if (taskId === CLIENT_TASK_ID) {
          const clientTask = createClientTask();

          return {
            ...clientTask,
            custom_fields: clientTask.custom_fields.filter(
              (field) => field.id !== FIRST_PAYMENT_DATE_FIELD_ID,
            ),
          };
        }

        throw new Error(`Unexpected task lookup: ${taskId}`);
      }),
      getAllTasksFromList: mock(async () => [
        createPartnerTask({ commissionRule: "Teste\n" }),
      ]),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createCompesacaoTaskCommand({
      clickUpClient,
      compesacaoListId: COMPESACAO_LIST_ID,
      partnersListId: "partners-list-123",
    });

    await command(createTaskUpdatedPayload());

    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: DESTINATION_PAYMENT_PARTNER_FIELD_ID,
      value: 1783666800000,
      valueOptions: undefined,
    });
  });

  test("ignores tasks outside the configured COMPESACAO list", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async () =>
        createSourceTask({
          listId: "another-list",
        }),
      ),
      getAllTasksFromList: mock(async () => []),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createCompesacaoTaskCommand({
      clickUpClient,
      compesacaoListId: COMPESACAO_LIST_ID,
      partnersListId: "partners-list-123",
    });

    await command(createTaskUpdatedPayload());

    expect(clickUpClient.createTask).not.toHaveBeenCalled();
    expect(clickUpClient.getAllTasksFromList).not.toHaveBeenCalled();
    expect(clickUpClient.createTaskComment).not.toHaveBeenCalled();
  });

  test("comments and aborts when the source task has no linked related task", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async () =>
        createSourceTask({
          linkedTasks: [{ task_id: SOURCE_TASK_ID }],
        }),
      ),
      getAllTasksFromList: mock(async () => []),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createCompesacaoTaskCommand({
      clickUpClient,
      compesacaoListId: COMPESACAO_LIST_ID,
      partnersListId: "partners-list-123",
    });

    await command(createTaskUpdatedPayload());

    expect(clickUpClient.createTask).not.toHaveBeenCalled();
    expect(clickUpClient.createTaskComment).toHaveBeenCalledWith({
      taskId: SOURCE_TASK_ID,
      commentText:
        "Fluxo COMPESACAO interrompido: não foi possível resolver task relacionada. sourceTaskId=comp-task-123",
      notifyAll: false,
    });
  });

  test("comments and aborts when the related task has no client relationship", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async (taskId: string) => {
        if (taskId === SOURCE_TASK_ID) {
          return createSourceTask();
        }

        return {
          id: RELATED_TASK_ID,
          custom_fields: [],
        };
      }),
      getAllTasksFromList: mock(async () => []),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createCompesacaoTaskCommand({
      clickUpClient,
      compesacaoListId: COMPESACAO_LIST_ID,
      partnersListId: "partners-list-123",
    });

    await command(createTaskUpdatedPayload());

    expect(clickUpClient.createTask).not.toHaveBeenCalled();
    expect(clickUpClient.createTaskComment).toHaveBeenCalledWith({
      taskId: SOURCE_TASK_ID,
      commentText:
        "Fluxo COMPESACAO interrompido: não foi possível resolver cliente vinculado. sourceTaskId=comp-task-123 relatedTaskId=related-task-456 relatedClientFieldId=49414079-b1ff-4644-ac85-71a5448424cc",
      notifyAll: false,
    });
  });

  test("comments and aborts when the client task has no partner", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async (taskId: string) => {
        if (taskId === SOURCE_TASK_ID) {
          return createSourceTask();
        }

        if (taskId === RELATED_TASK_ID) {
          return createRelatedTask();
        }

        return {
          ...createClientTask(),
          custom_fields: createClientTask().custom_fields.filter(
            (field) => field.id !== PARTNER_FIELD_ID,
          ),
        };
      }),
      getAllTasksFromList: mock(async () => []),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createCompesacaoTaskCommand({
      clickUpClient,
      compesacaoListId: COMPESACAO_LIST_ID,
      partnersListId: "partners-list-123",
    });

    await command(createTaskUpdatedPayload());

    expect(clickUpClient.createTask).not.toHaveBeenCalled();
    expect(clickUpClient.createTaskComment).toHaveBeenCalledWith({
      taskId: SOURCE_TASK_ID,
      commentText:
        "Fluxo COMPESACAO interrompido: não foi possível resolver parceiro na task do cliente. sourceTaskId=comp-task-123 relatedTaskId=related-task-456 clientTaskId=client-task-123 partnerFieldId=9dad0502-6c3a-4aff-bb58-ddcc8857ebb0",
      notifyAll: false,
    });
  });

  test("comments and aborts when the partner task cannot be found", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async (taskId: string) => {
        if (taskId === SOURCE_TASK_ID) {
          return createSourceTask();
        }

        if (taskId === RELATED_TASK_ID) {
          return createRelatedTask();
        }

        return createClientTask();
      }),
      getAllTasksFromList: mock(async () => []),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createCompesacaoTaskCommand({
      clickUpClient,
      compesacaoListId: COMPESACAO_LIST_ID,
      partnersListId: "partners-list-123",
    });

    await command(createTaskUpdatedPayload());

    expect(clickUpClient.createTask).not.toHaveBeenCalled();
    expect(clickUpClient.createTaskComment).toHaveBeenCalledWith({
      taskId: SOURCE_TASK_ID,
      commentText:
        "Fluxo COMPESACAO interrompido: não foi possível resolver parceiro correspondente. sourceTaskId=comp-task-123 clientTaskId=client-task-123 partnerFieldId=9dad0502-6c3a-4aff-bb58-ddcc8857ebb0 partnerValue=82ad9f4e-e45d-4bc6-9592-59a6a0655c7b partnersListId=partners-list-123",
      notifyAll: false,
    });
  });

  test("creates the task and skips the commission rule when the partner task has no rule", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "created-task-123" })),
      getTask: mock(async (taskId: string) => {
        if (taskId === SOURCE_TASK_ID) {
          return createSourceTask();
        }

        if (taskId === RELATED_TASK_ID) {
          return createRelatedTask();
        }

        return createClientTask();
      }),
      getAllTasksFromList: mock(async () => [createPartnerTask()]),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createCompesacaoTaskCommand({
      clickUpClient,
      compesacaoListId: COMPESACAO_LIST_ID,
      partnersListId: "partners-list-123",
      assigneesList: "",
    });

    await command(createTaskUpdatedPayload());

    expect(clickUpClient.createTask).toHaveBeenCalledTimes(1);
    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: COMMISSION_RULE_FIELD_ID,
      }),
    );
  });

});
