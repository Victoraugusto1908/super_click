import { describe, expect, mock, test } from "bun:test";

import {
  COMMISSION_RULE_FIELD_ID,
  createLinkPartnerRelationshipCommand,
  DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID,
  PARTNER_FIELD_ID,
  SN_ALIQUOTA_FIELD_ID,
} from "../commands/link-partner-relationship";
import { DESTINATION_COMMISSION_VALUE_FIELD_ID } from "../commands/partner-commission-task-shared";
import type { ClickUpAutomationWebhookPayload } from "../types/clickup-webhook";
import type { ClickUpTask } from "../utils/clickup";

function createAutomationPayload(
  fieldOverrides?: Partial<{
    value: unknown;
    value_deleted: boolean;
  }>,
): ClickUpAutomationWebhookPayload {
  const fields =
    fieldOverrides === undefined
      ? []
      : [
          {
            field_id: PARTNER_FIELD_ID,
            type: 1,
            value: fieldOverrides.value,
            value_deleted: fieldOverrides.value_deleted,
          },
        ];

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
      fields,
    },
  };
}

function createAutomationPayloadWithFields(
  fields: ClickUpAutomationWebhookPayload["payload"]["fields"],
): ClickUpAutomationWebhookPayload {
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
      fields,
    },
  };
}

function createClientTaskWithCommissionValue(
  commissionValue: unknown,
): ClickUpTask {
  return {
    id: "task_123",
    custom_fields:
      commissionValue === undefined
        ? []
        : [
            {
              id: DESTINATION_COMMISSION_VALUE_FIELD_ID,
              value: commissionValue,
            },
          ],
  };
}

function createClickUpClientMock(overrides?: {
  getAllTasksFromListResult?: ClickUpTask[];
  getTaskResult?: ClickUpTask;
}) {
  return {
    createTask: mock(async () => ({ id: "unused" })),
    getTask: mock(
      async () => overrides?.getTaskResult ?? createClientTaskWithCommissionValue(undefined),
    ),
    getAllTasksFromList: mock(async () => overrides?.getAllTasksFromListResult ?? []),
    createTaskComment: mock(async () => {}),
    setCustomFieldValue: mock(async () => {}),
  };
}

describe("createLinkPartnerRelationshipCommand", () => {
  test("ignores payloads without the partner field", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async () => ({ id: "unused" })),
      getAllTasksFromList: mock(async () => []),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(createAutomationPayload());

    expect(clickUpClient.getAllTasksFromList).not.toHaveBeenCalled();
    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalled();
  });

  test("ignores deleted partner field values", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async () => ({ id: "unused" })),
      getAllTasksFromList: mock(async () => []),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayload({
        value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
        value_deleted: true,
      }),
    );

    expect(clickUpClient.getAllTasksFromList).not.toHaveBeenCalled();
    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalled();
  });

  test("ignores empty partner field values", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async () => ({ id: "unused" })),
      getAllTasksFromList: mock(async () => []),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayload({
        value: "",
      }),
    );

    expect(clickUpClient.getAllTasksFromList).not.toHaveBeenCalled();
    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalled();
  });

  test("logs and stops when no matching partner task is found", async () => {
    const logger = {
      log: mock(() => {}),
    };
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async () => ({ id: "unused" })),
      getAllTasksFromList: mock(async () => [
        {
          id: "partner-task-1",
          custom_fields: [
            {
              id: PARTNER_FIELD_ID,
              value: "another-partner-id",
            },
          ],
        },
      ]),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      logger,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayload({
        value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
      }),
    );

    expect(clickUpClient.getAllTasksFromList).toHaveBeenCalledWith(
      "partners-list-123",
    );
    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "No matching partner task found for automation payload.",
      {
        taskId: "task_123",
        partnerFieldId: PARTNER_FIELD_ID,
        partnerValue: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
        partnersListId: "partners-list-123",
      },
    );
  });

  test("links the partner relationship when the task field already stores the option id", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async () => ({ id: "unused" })),
      getAllTasksFromList: mock(async () => [
        {
          id: "partner-task-1",
          custom_fields: [
            {
              id: PARTNER_FIELD_ID,
              value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
            },
            {
              id: COMMISSION_RULE_FIELD_ID,
              value: "regra parceiro 1",
            },
          ],
        },
      ]),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayload({
        value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
      }),
    );

    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(1, {
      taskId: "task_123",
      fieldId: DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID,
      value: {
        add: ["partner-task-1"],
      },
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(2, {
      taskId: "task_123",
      fieldId: COMMISSION_RULE_FIELD_ID,
      value: "regra parceiro 1",
    });
  });

  test("links the partner relationship when the task field uses the dropdown index", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async () => ({ id: "unused" })),
      getAllTasksFromList: mock(async () => [
        {
          id: "partner-task-1",
          custom_fields: [
            {
              id: PARTNER_FIELD_ID,
              value: 3,
              type_config: {
                options: [
                  { id: "option-0" },
                  { id: "option-1" },
                  { id: "option-2" },
                  { id: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b" },
                ],
              },
            },
            {
              id: COMMISSION_RULE_FIELD_ID,
              value: "regra parceiro 2",
            },
          ],
        },
      ]),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayload({
        value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
      }),
    );

    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(1, {
      taskId: "task_123",
      fieldId: DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID,
      value: {
        add: ["partner-task-1"],
      },
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(2, {
      taskId: "task_123",
      fieldId: COMMISSION_RULE_FIELD_ID,
      value: "regra parceiro 2",
    });
  });

  test("uses the first matching partner task when there are duplicates", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async () => ({ id: "unused" })),
      getAllTasksFromList: mock(async () => [
        {
          id: "partner-task-1",
          custom_fields: [
            {
              id: PARTNER_FIELD_ID,
              value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
            },
            {
              id: COMMISSION_RULE_FIELD_ID,
              value: "regra parceiro 1",
            },
          ],
        },
        {
          id: "partner-task-2",
          custom_fields: [
            {
              id: PARTNER_FIELD_ID,
              value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
            },
            {
              id: COMMISSION_RULE_FIELD_ID,
              value: "regra parceiro 2",
            },
          ],
        },
      ]),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayload({
        value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
      }),
    );

    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(1, {
      taskId: "task_123",
      fieldId: DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID,
      value: {
        add: ["partner-task-1"],
      },
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(2, {
      taskId: "task_123",
      fieldId: COMMISSION_RULE_FIELD_ID,
      value: "regra parceiro 1",
    });
  });

  test("skips commission rule update when the matched partner task has no value", async () => {
    const clickUpClient = {
      createTask: mock(async () => ({ id: "unused" })),
      getTask: mock(async () => ({ id: "unused" })),
      getAllTasksFromList: mock(async () => [
        {
          id: "partner-task-1",
          custom_fields: [
            {
              id: PARTNER_FIELD_ID,
              value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
            },
          ],
        },
      ]),
      createTaskComment: mock(async () => {}),
      setCustomFieldValue: mock(async () => {}),
    };
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayload({
        value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
      }),
    );

    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledTimes(1);
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "task_123",
      fieldId: DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID,
      value: {
        add: ["partner-task-1"],
      },
    });
  });

  test("ignores SN aliquota updates when the field is empty, deleted, or zero", async () => {
    const clickUpClient = createClickUpClientMock();
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayloadWithFields([
        {
          field_id: SN_ALIQUOTA_FIELD_ID,
          type: 1,
          value: "",
        },
      ]),
    );
    await command(
      createAutomationPayloadWithFields([
        {
          field_id: SN_ALIQUOTA_FIELD_ID,
          type: 1,
          value: 10,
          value_deleted: true,
        },
      ]),
    );
    await command(
      createAutomationPayloadWithFields([
        {
          field_id: SN_ALIQUOTA_FIELD_ID,
          type: 1,
          value: 0,
        },
      ]),
    );

    expect(clickUpClient.getTask).not.toHaveBeenCalled();
    expect(clickUpClient.getAllTasksFromList).not.toHaveBeenCalled();
    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalled();
  });

  test("recalculates Valor comissão when SN aliquota is valid", async () => {
    const clickUpClient = createClickUpClientMock({
      getTaskResult: createClientTaskWithCommissionValue("1000"),
    });
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayloadWithFields([
        {
          field_id: SN_ALIQUOTA_FIELD_ID,
          type: 1,
          value: 10,
        },
      ]),
    );

    expect(clickUpClient.getTask).toHaveBeenCalledTimes(1);
    expect(clickUpClient.getTask).toHaveBeenCalledWith("task_123");
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledTimes(1);
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "task_123",
      fieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
      value: "900.00",
    });
  });

  test("uses the current task Valor comissão as the calculation base", async () => {
    const clickUpClient = createClickUpClientMock({
      getTaskResult: createClientTaskWithCommissionValue("500"),
    });
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayloadWithFields([
        {
          field_id: SN_ALIQUOTA_FIELD_ID,
          type: 1,
          value: 10,
        },
        {
          field_id: DESTINATION_COMMISSION_VALUE_FIELD_ID,
          type: 1,
          value: "9999",
        },
      ]),
    );

    expect(clickUpClient.getTask).toHaveBeenCalledWith("task_123");
    expect(clickUpClient.setCustomFieldValue).toHaveBeenCalledWith({
      taskId: "task_123",
      fieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
      value: "450.00",
    });
  });

  test("comments and skips SN aliquota recalculation when Valor comissão is missing", async () => {
    const logger = {
      log: mock(() => {}),
    };
    const clickUpClient = createClickUpClientMock({
      getTaskResult: createClientTaskWithCommissionValue(undefined),
    });
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      logger,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayloadWithFields([
        {
          field_id: SN_ALIQUOTA_FIELD_ID,
          type: 1,
          value: 10,
        },
      ]),
    );

    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalled();
    expect(clickUpClient.createTaskComment).toHaveBeenCalledTimes(1);
    expect(clickUpClient.createTaskComment).toHaveBeenCalledWith({
      taskId: "task_123",
      commentText:
        "Não foi possível informar Valor Comissão. " +
        "A alíquota de SN (10%) foi recebida, mas o campo Valor Comissão está vazio na task.",
      notifyAll: false,
    });
    expect(logger.log).toHaveBeenCalledWith(
      "Skipping SN aliquota commission recalculation due to invalid base value.",
      {
        taskId: "task_123",
        commissionFieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
        currentCommissionValue: null,
        snAliquotaFieldId: SN_ALIQUOTA_FIELD_ID,
        snAliquotaPercentage: 10,
      },
    );
  });

  test("logs and skips SN aliquota recalculation when Valor comissão is invalid", async () => {
    const logger = {
      log: mock(() => {}),
    };
    const clickUpClient = createClickUpClientMock({
      getTaskResult: createClientTaskWithCommissionValue("R$ abc"),
    });
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      logger,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayloadWithFields([
        {
          field_id: SN_ALIQUOTA_FIELD_ID,
          type: 1,
          value: 10,
        },
      ]),
    );

    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalled();
    expect(clickUpClient.createTaskComment).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "Skipping SN aliquota commission recalculation due to invalid base value.",
      {
        taskId: "task_123",
        commissionFieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
        currentCommissionValue: "R$ abc",
        snAliquotaFieldId: SN_ALIQUOTA_FIELD_ID,
        snAliquotaPercentage: 10,
      },
    );
  });

  test("executes partner linking and SN aliquota recalculation in the same payload", async () => {
    const clickUpClient = createClickUpClientMock({
      getAllTasksFromListResult: [
        {
          id: "partner-task-1",
          custom_fields: [
            {
              id: PARTNER_FIELD_ID,
              value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
            },
            {
              id: COMMISSION_RULE_FIELD_ID,
              value: "regra parceiro 1",
            },
          ],
        },
      ],
      getTaskResult: createClientTaskWithCommissionValue("1000"),
    });
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayloadWithFields([
        {
          field_id: PARTNER_FIELD_ID,
          type: 1,
          value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
        },
        {
          field_id: SN_ALIQUOTA_FIELD_ID,
          type: 1,
          value: 10,
        },
      ]),
    );

    expect(clickUpClient.getAllTasksFromList).toHaveBeenCalledWith(
      "partners-list-123",
    );
    expect(clickUpClient.getTask).toHaveBeenCalledWith("task_123");
    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(1, {
      taskId: "task_123",
      fieldId: DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID,
      value: {
        add: ["partner-task-1"],
      },
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(2, {
      taskId: "task_123",
      fieldId: COMMISSION_RULE_FIELD_ID,
      value: "regra parceiro 1",
    });
    expect(clickUpClient.setCustomFieldValue).toHaveBeenNthCalledWith(3, {
      taskId: "task_123",
      fieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
      value: "900.00",
    });
  });

  test("ignores invalid SN aliquota values outside the accepted range", async () => {
    const clickUpClient = createClickUpClientMock({
      getTaskResult: createClientTaskWithCommissionValue("1000"),
    });
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient,
      partnersListId: "partners-list-123",
    });

    await command(
      createAutomationPayloadWithFields([
        {
          field_id: SN_ALIQUOTA_FIELD_ID,
          type: 1,
          value: -10,
        },
      ]),
    );
    await command(
      createAutomationPayloadWithFields([
        {
          field_id: SN_ALIQUOTA_FIELD_ID,
          type: 1,
          value: 101,
        },
      ]),
    );
    await command(
      createAutomationPayloadWithFields([
        {
          field_id: SN_ALIQUOTA_FIELD_ID,
          type: 1,
          value: "NaN",
        },
      ]),
    );

    expect(clickUpClient.getTask).not.toHaveBeenCalled();
    expect(clickUpClient.setCustomFieldValue).not.toHaveBeenCalled();
  });

  test("throws when PARTNERS_LIST is not configured", async () => {
    const command = createLinkPartnerRelationshipCommand({
      clickUpClient: {
        createTask: mock(async () => ({ id: "unused" })),
        getTask: mock(async () => ({ id: "unused" })),
        getAllTasksFromList: mock(async () => []),
        createTaskComment: mock(async () => {}),
        setCustomFieldValue: mock(async () => {}),
      },
      partnersListId: "",
    });

    await expect(
      command(
        createAutomationPayload({
          value: "82ad9f4e-e45d-4bc6-9592-59a6a0655c7b",
        }),
      ),
    ).rejects.toThrow("PARTNERS_LIST is not configured");
  });
});
