import { describe, expect, mock, test } from "bun:test";

import {
  buildPartnerCommissionCustomFieldUpdates,
  buildPartnerCommissionTaskInput,
  createPartnerCommissionTaskCommand,
} from "../commands/create-partner-commission-task";
import type { ClickUpAutomationWebhookPayload } from "../types/clickup-webhook";

function createAutomationPayload(): ClickUpAutomationWebhookPayload {
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
          value: "123",
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
          field_id: "ddb374d1-6293-4d9c-b907-447bf123c38a",
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
    },
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
        fieldId: "ddb374d1-6293-4d9c-b907-447bf123c38a",
        value: 1782802800000,
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
});

describe("buildPartnerCommissionTaskInput", () => {
  test("builds task header fields from the automation payload", () => {
    const input = buildPartnerCommissionTaskInput(createAutomationPayload(), {
      assigneesList: "290658850, 123456789",
      now: () => 1780000000000,
    });

    expect(input).toEqual({
      name: "Victor Augusto LTDA",
      status: "pendente",
      customItemId: 1009,
      tags: ["classificação", "conciliação", "jurídico", "tributário"],
      startDate: 1780695428760,
      dueDate: 1783234800000,
      priority: 2,
      assignees: [290658850, 123456789],
    });
  });

  test("uses now plus five days when Data 1º pagamento is missing", () => {
    const input = buildPartnerCommissionTaskInput(
      {
        ...createAutomationPayload(),
        payload: {
          ...createAutomationPayload().payload,
          fields: createAutomationPayload().payload.fields?.filter(
            (field) =>
              field.field_id !== "ddb374d1-6293-4d9c-b907-447bf123c38a",
          ),
        },
      },
      {
        assigneesList: "290658850,123456789",
        now: () => 1781000000000,
      },
    );

    expect(input.dueDate).toBe(1781432000000);
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

describe("createPartnerCommissionTaskCommand", () => {
  test("creates the task before updating mapped custom fields", async () => {
    const callSequence: string[] = [];
    const clickUpClient = {
      createTask: mock(async () => {
        callSequence.push("createTask");
        return {
          id: "created-task-123",
        };
      }),
      getAllTasksFromList: mock(async () => []),
      setCustomFieldValue: mock(async ({ fieldId }: { fieldId: string }) => {
        callSequence.push(`setCustomFieldValue:${fieldId}`);
      }),
    };
    const command = createPartnerCommissionTaskCommand({
      clickUpClient,
      assigneesList: "",
    });

    await command(createAutomationPayload());

    expect(clickUpClient.createTask).toHaveBeenCalledTimes(1);
    expect(clickUpClient.createTask).toHaveBeenCalledWith({
      name: "Victor Augusto LTDA",
      status: "pendente",
      customItemId: 1009,
      tags: ["classificação", "conciliação", "jurídico", "tributário"],
      startDate: 1780695428760,
      dueDate: 1783234800000,
      priority: 2,
      assignees: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledTimes(8);
    expect(callSequence[0]).toBe("createTask");
    expect(callSequence.slice(1)).toEqual([
      "setCustomFieldValue:11a7f636-c49e-4423-b9d5-85fb4fc2fd52",
      "setCustomFieldValue:50839e8d-bcdb-49fd-958d-1a4ee1987fa5",
      "setCustomFieldValue:9dad0502-6c3a-4aff-bb58-ddcc8857ebb0",
      "setCustomFieldValue:ddb374d1-6293-4d9c-b907-447bf123c38a",
      "setCustomFieldValue:3b0f0be7-438c-4129-9e4a-dad32effdc57",
      "setCustomFieldValue:436b89e7-a566-487b-becb-8e0091893a14",
      "setCustomFieldValue:ec16180c-8ece-4a86-8d8d-4cfc9965fbd1",
      "setCustomFieldValue:2bfd292d-e0c9-486f-8fd1-e5f6e37654b7",
    ]);
    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(7, {
      taskId: "created-task-123",
      fieldId: "ec16180c-8ece-4a86-8d8d-4cfc9965fbd1",
      value: {
        add: [290658850],
      },
      valueOptions: undefined,
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(8, {
      taskId: "created-task-123",
      fieldId: "2bfd292d-e0c9-486f-8fd1-e5f6e37654b7",
      value: {
        add: ["86e1r19f2"],
      },
      valueOptions: undefined,
    });
  });

  test("skips unmapped or missing fields", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({
        id: "created-task-123",
      })),
      getAllTasksFromList: mock(async () => []),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createPartnerCommissionTaskCommand({
      clickUpClient,
      assigneesList: "",
    });
    const payload = createAutomationPayload();

    payload.payload.fields = [
      {
        field_id: "11a7f636-c49e-4423-b9d5-85fb4fc2fd52",
        value: "123",
      },
      {
        field_id: "7c8d448e-6b4c-4e66-a12a-63a9d73469e0",
        value: "nao deve ser enviado",
      },
    ];

    await command(payload);

    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledTimes(2);
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
  });

  test("skips Data 1º pagamento when it is missing", async () => {
    const updates = buildPartnerCommissionCustomFieldUpdates({
      ...createAutomationPayload(),
      payload: {
        ...createAutomationPayload().payload,
        fields: createAutomationPayload().payload.fields?.filter(
          (field) =>
            field.field_id !== "ddb374d1-6293-4d9c-b907-447bf123c38a",
        ),
      },
    });

    expect(updates).not.toContainEqual({
      fieldId: "ddb374d1-6293-4d9c-b907-447bf123c38a",
      value: 1782802800000,
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

  test("creates the destination task without tags when the automation has none", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({
        id: "created-task-123",
      })),
      getAllTasksFromList: mock(async () => []),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createPartnerCommissionTaskCommand({
      clickUpClient,
      assigneesList: "",
    });
    const payload = {
      ...createAutomationPayload(),
      payload: {
        ...createAutomationPayload().payload,
        tags: undefined,
      },
    };

    await command(payload);

    expect(clickUpClient.createTask).toHaveBeenCalledWith({
      name: "Victor Augusto LTDA",
      status: "pendente",
      customItemId: 1009,
      tags: undefined,
      startDate: 1780695428760,
      dueDate: 1783234800000,
      priority: 2,
      assignees: undefined,
    });
  });
});
