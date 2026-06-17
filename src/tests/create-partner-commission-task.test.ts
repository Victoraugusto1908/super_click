import { describe, expect, mock, test } from "bun:test";

import {
  buildPartnerCommissionCustomFieldUpdates,
  buildPartnerCommissionTaskInput,
  createPartnerCommissionTaskCommand,
} from "../commands/create-partner-commission-task";
import {
  DESTINATION_COMMISSION_VALUE_FIELD_ID,
  DESTINATION_PAYMENT_PARTNER_FIELD_ID,
  FIRST_PAYMENT_DATE_FIELD_ID,
  normalizePartnerCommissionValue,
} from "../commands/partner-commission-task-shared";
import type { ClickUpAutomationWebhookPayload } from "../types/clickup-webhook";

function createAutomationPayload(
  overrides?: Partial<ClickUpAutomationWebhookPayload["payload"]> & {
    firstPaymentAmount?: unknown;
  },
): ClickUpAutomationWebhookPayload {
  const {
    firstPaymentAmount = "123",
    ...payloadOverrides
  } = overrides ?? {};

  return {
    auto_id: "auto_123",
    trigger_id: "trigger_123",
    date: "2026-06-05T18:42:20.382Z",
    payload: {
      id: "86e1r19f2",
      name: "Victor Augusto LTDA",
      subcategory: "source-list-123",
      time_mgmt: {
        date_created: "1780695428760",
      },
      lists: [
        {
          list_id: "source-list-123",
          type: "home",
        },
      ],
      tags: ["classificação", "conciliação", "jurídico", "tributário"],
      fields: [
        {
          field_id: "11a7f636-c49e-4423-b9d5-85fb4fc2fd52",
          value: firstPaymentAmount,
          type: 15,
        },
        {
          field_id: "14fb928b-77fe-4d9b-8979-93ebc14b5ec9",
          value: "Victor Tech ILTDA",
          type: 15,
        },
        {
          field_id: "50839e8d-bcdb-49fd-958d-1a4ee1987fa5",
          value: "ccad701a-fa27-4fb5-ab2c-29e7a13cd113",
          type: 1,
        },
        {
          field_id: "9dad0502-6c3a-4aff-bb58-ddcc8857ebb0",
          value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
          type: 1,
        },
        {
          field_id: FIRST_PAYMENT_DATE_FIELD_ID,
          value: 1782802800000,
          type: 4,
        },
        {
          field_id: "d4495e14-269b-48c0-a649-42fcc7427af8",
          value: [290658850],
          type: 10,
        },
        {
          field_id: "fb911467-4b4e-468a-8769-e98be89594ff",
          value: "12.123.123/0001-00",
          type: 15,
        },
        {
          field_id: "7c8d448e-6b4c-4e66-a12a-63a9d73469e0",
          value: "nao deve ser enviado",
          type: 0,
        },
      ],
      ...payloadOverrides,
    },
  };
}

function createClickUpClientMock(options?: {
  createTaskIds?: string[];
  setCustomFieldValueImpl?: (input: {
    taskId: string;
    fieldId: string;
    value: unknown;
    valueOptions?: Record<string, unknown>;
  }) => Promise<void>;
}) {
  let createTaskIndex = 0;

  return {
    createTask: mock(async () => ({
      id: options?.createTaskIds?.[createTaskIndex++] ?? "created-task-123",
    })),
    getTask: mock(async () => ({ id: "unused" })),
    getAllTasksFromList: mock(async () => []),
    createTaskComment: mock(async () => {}),
    setCustomFieldValue: mock(
      options?.setCustomFieldValueImpl ?? (async () => {}),
    ),
  };
}

describe("buildPartnerCommissionCustomFieldUpdates", () => {
  test("maps only the approved custom fields", () => {
    const updates = buildPartnerCommissionCustomFieldUpdates(
      createAutomationPayload(),
    );

    expect(updates).toEqual([
      {
        fieldId: "11a7f636-c49e-4423-b9d5-85fb4fc2fd52",
        value: "123",
        valueOptions: undefined,
      },
      {
        fieldId: "50839e8d-bcdb-49fd-958d-1a4ee1987fa5",
        value: "ccad701a-fa27-4fb5-ab2c-29e7a13cd113",
        valueOptions: undefined,
      },
      {
        fieldId: "9dad0502-6c3a-4aff-bb58-ddcc8857ebb0",
        value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
        valueOptions: undefined,
      },
      {
        fieldId: FIRST_PAYMENT_DATE_FIELD_ID,
        value: 1782802800000,
        valueOptions: undefined,
      },
      {
        fieldId: DESTINATION_PAYMENT_PARTNER_FIELD_ID,
        value: 1783666800000,
        valueOptions: undefined,
      },
      {
        fieldId: "3b0f0be7-438c-4129-9e4a-dad32effdc57",
        value: "Victor Tech ILTDA",
        valueOptions: undefined,
      },
      {
        fieldId: "436b89e7-a566-487b-becb-8e0091893a14",
        value: "12.123.123/0001-00",
        valueOptions: undefined,
      },
      {
        fieldId: "ec16180c-8ece-4a86-8d8d-4cfc9965fbd1",
        value: {
          add: [290658850],
        },
        valueOptions: undefined,
      },
      {
        fieldId: "2bfd292d-e0c9-486f-8fd1-e5f6e37654b7",
        value: {
          add: ["86e1r19f2"],
        },
        valueOptions: undefined,
      },
    ]);
  });

  test("skips Data 1º pagamento when it is missing", () => {
    const updates = buildPartnerCommissionCustomFieldUpdates(
      createAutomationPayload({
        fields: createAutomationPayload().payload.fields?.filter(
          (field) => field.field_id !== FIRST_PAYMENT_DATE_FIELD_ID,
        ),
      }),
    );

    expect(updates).not.toContainEqual({
      fieldId: FIRST_PAYMENT_DATE_FIELD_ID,
      value: 1782802800000,
      valueOptions: undefined,
    });
    expect(updates).not.toContainEqual({
      fieldId: DESTINATION_PAYMENT_PARTNER_FIELD_ID,
      value: 1783666800000,
      valueOptions: undefined,
    });
    expect(updates).toContainEqual({
      fieldId: "2bfd292d-e0c9-486f-8fd1-e5f6e37654b7",
      value: {
        add: ["86e1r19f2"],
      },
      valueOptions: undefined,
    });
  });
});

describe("buildPartnerCommissionTaskInput", () => {
  test("builds task header fields using the first eligible service tag", () => {
    const input = buildPartnerCommissionTaskInput(createAutomationPayload(), {
      assigneesList: "290658850, 123456789",
      now: () => 1780000000000,
    });

    expect(input).toEqual({
      name: "Victor Augusto LTDA",
      status: "pendente",
      customItemId: 1009,
      tags: ["classificação"],
      startDate: 1780695428760,
      dueDate: 1783234800000,
      priority: 2,
      assignees: [290658850, 123456789],
    });
  });

  test("falls back to the source tags when there is no eligible service", () => {
    const input = buildPartnerCommissionTaskInput(
      createAutomationPayload({
        tags: ["tributário"],
      }),
      {
        assigneesList: "290658850,123456789",
        now: () => 1781000000000,
      },
    );

    expect(input.tags).toEqual(["tributário"]);
    expect(input.dueDate).toBe(1783234800000);
  });

  test("creates without assignees when ASSIGNEES_LIST is invalid", () => {
    const warnMock = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warnMock;

    try {
      const input = buildPartnerCommissionTaskInput(createAutomationPayload(), {
        assigneesList: "290658850,abc",
        now: () => 1780000000000,
      });

      expect(input.assignees).toBeUndefined();
      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith(
        "ASSIGNEES_LIST is invalid; creating the task without assignees.",
        { assigneesList: "290658850,abc" },
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe("normalizePartnerCommissionValue", () => {
  test("normalizes supported money-like values", () => {
    expect(normalizePartnerCommissionValue("123")).toBe("123");
    expect(normalizePartnerCommissionValue("123.45")).toBe("123.45");
    expect(normalizePartnerCommissionValue("R$ 123")).toBe("123");
    expect(normalizePartnerCommissionValue("R$123,45")).toBe("123.45");
  });

  test("returns undefined for invalid values", () => {
    expect(normalizePartnerCommissionValue("R$ abc")).toBeUndefined();
    expect(normalizePartnerCommissionValue({})).toBeUndefined();
  });
});

describe("createPartnerCommissionTaskCommand", () => {
  test("creates one destination task per eligible service tag", async () => {
    const clickUpClient = createClickUpClientMock({
      createTaskIds: [
        "created-task-classificacao",
        "created-task-conciliacao",
        "created-task-juridico",
      ],
    });
    const command = createPartnerCommissionTaskCommand({
      clickUpClient,
      assigneesList: "",
    });

    await command(createAutomationPayload());

    expect(clickUpClient.createTask).toHaveBeenCalledTimes(3);
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
      tags: ["conciliação"],
      startDate: 1780695428760,
      dueDate: 1783234800000,
      priority: 2,
      assignees: undefined,
    });
    expect(clickUpClient.createTask).toHaveBeenNthCalledWith(3, {
      name: "Victor Augusto LTDA",
      status: "pendente",
      customItemId: 1009,
      tags: ["jurídico"],
      startDate: 1780695428760,
      dueDate: 1783234800000,
      priority: 2,
      assignees: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledTimes(30);
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-classificacao",
      fieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
      value: "123",
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-conciliacao",
      fieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
      value: "123",
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "created-task-juridico",
      fieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
      value: "123",
    });
    expect(clickUpClient.createTaskComment).not.toHaveBeenCalled();
  });

  test("does not create tasks when tributário is the only selected tag", async () => {
    const clickUpClient = createClickUpClientMock();
    const command = createPartnerCommissionTaskCommand({
      clickUpClient,
      assigneesList: "",
    });

    await command(
      createAutomationPayload({
        tags: ["tributário"],
      }),
    );

    expect(clickUpClient.createTask).not.toHaveBeenCalled();
    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalled();
    expect(clickUpClient.createTaskComment).not.toHaveBeenCalled();
  });

  test("deduplicates eligible service tags before creating tasks", async () => {
    const clickUpClient = createClickUpClientMock({
      createTaskIds: ["created-task-1", "created-task-2"],
    });
    const command = createPartnerCommissionTaskCommand({
      clickUpClient,
      assigneesList: "",
    });

    await command(
      createAutomationPayload({
        tags: [
          "classificação",
          "classificação",
          "tributário",
          "jurídico",
          "jurídico",
        ],
      }),
    );

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

  test("skips unmapped fields while still setting relation and commission", async () => {
    const clickUpClient = createClickUpClientMock();
    const command = createPartnerCommissionTaskCommand({
      clickUpClient,
      assigneesList: "",
    });
    const payload = createAutomationPayload({
      tags: ["classificação"],
      fields: [
        {
          field_id: "11a7f636-c49e-4423-b9d5-85fb4fc2fd52",
          value: "123",
        },
        {
          field_id: "7c8d448e-6b4c-4e66-a12a-63a9d73469e0",
          value: "nao deve ser enviado",
        },
      ],
    });

    await command(payload);

    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledTimes(3);
    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(1, {
      taskId: "created-task-123",
      fieldId: "11a7f636-c49e-4423-b9d5-85fb4fc2fd52",
      value: "123",
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(2, {
      taskId: "created-task-123",
      fieldId: "2bfd292d-e0c9-486f-8fd1-e5f6e37654b7",
      value: {
        add: ["86e1r19f2"],
      },
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(3, {
      taskId: "created-task-123",
      fieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
      value: "123",
    });
  });

  test("comments on the destination task when the commission value is invalid", async () => {
    const clickUpClient = createClickUpClientMock();
    const command = createPartnerCommissionTaskCommand({
      clickUpClient,
      assigneesList: "",
    });

    await command(
      createAutomationPayload({
        tags: ["classificação"],
        firstPaymentAmount: "R$ abc",
      }),
    );

    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalledWith({
      taskId: "created-task-123",
      fieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
      value: "R$ abc",
    });
    expect(clickUpClient.createTaskComment).toHaveBeenCalledTimes(1);
    expect(clickUpClient.createTaskComment).toHaveBeenCalledWith({
      taskId: "created-task-123",
      commentText:
        "Não foi possível informar Valor Comissão. " +
        "Valor da primeira mensalidade recebido: R$ abc",
      notifyAll: false,
    });
  });

  test("comments on the destination task when ClickUp rejects the commission field", async () => {
    const clickUpClient = createClickUpClientMock({
      setCustomFieldValueImpl: async ({ fieldId }) => {
        if (fieldId === DESTINATION_COMMISSION_VALUE_FIELD_ID) {
          throw new Error("invalid money value");
        }
      },
    });
    const command = createPartnerCommissionTaskCommand({
      clickUpClient,
      assigneesList: "",
    });

    await command(
      createAutomationPayload({
        tags: ["classificação"],
        firstPaymentAmount: "R$123,45",
      }),
    );

    expect(clickUpClient.createTaskComment).toHaveBeenCalledTimes(1);
    expect(clickUpClient.createTaskComment).toHaveBeenCalledWith({
      taskId: "created-task-123",
      commentText:
        "Não foi possível informar Valor Comissão. " +
        "Valor da primeira mensalidade recebido: R$123,45",
      notifyAll: false,
    });
  });
});
