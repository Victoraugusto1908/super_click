import type {
  ClickUpAutomationWebhookField,
  ClickUpAutomationWebhookPayload,
} from "../types/clickup-webhook";
import {
  createClickUpClient,
  type CreateClickUpTaskInput,
  type ClickUpClient,
} from "../utils/clickup";

export type ClickUpAutomationWebhookCommand = (
  payload: ClickUpAutomationWebhookPayload,
) => Promise<void>;

type PartnerCommissionTaskCommandDependencies = {
  clickUpClient?: ClickUpClient;
  destinationCustomItemId?: number;
  destinationStatus?: string;
  assigneesList?: string;
  now?: () => number;
};

type FieldMapping = {
  sourceFieldId: string;
  destinationFieldId: string;
};

type CustomFieldUpdate = {
  fieldId: string;
  value: unknown;
  valueOptions?: Record<string, unknown>;
};

const DEFAULT_DESTINATION_CUSTOM_ITEM_ID = 1009;
const DEFAULT_DESTINATION_STATUS = "pendente";
const DEFAULT_TASK_PRIORITY = 2;
const DUE_DATE_OFFSET_IN_MS = 5 * 24 * 60 * 60 * 1000;
const DESTINATION_CLIENT_RELATIONSHIP_FIELD_ID =
  "2bfd292d-e0c9-486f-8fd1-e5f6e37654b7";
const DESTINATION_SELLER_FIELD_ID = "ec16180c-8ece-4a86-8d8d-4cfc9965fbd1";
const FIRST_PAYMENT_DATE_FIELD_ID = "ddb374d1-6293-4d9c-b907-447bf123c38a";

const FIELD_MAPPINGS: readonly FieldMapping[] = [
  {
    sourceFieldId: "11a7f636-c49e-4423-b9d5-85fb4fc2fd52",
    destinationFieldId: "11a7f636-c49e-4423-b9d5-85fb4fc2fd52",
  },
  {
    sourceFieldId: "50839e8d-bcdb-49fd-958d-1a4ee1987fa5",
    destinationFieldId: "50839e8d-bcdb-49fd-958d-1a4ee1987fa5",
  },
  {
    sourceFieldId: "9dad0502-6c3a-4aff-bb58-ddcc8857ebb0",
    destinationFieldId: "9dad0502-6c3a-4aff-bb58-ddcc8857ebb0",
  },
  {
    sourceFieldId: FIRST_PAYMENT_DATE_FIELD_ID,
    destinationFieldId: FIRST_PAYMENT_DATE_FIELD_ID,
  },
  {
    sourceFieldId: "14fb928b-77fe-4d9b-8979-93ebc14b5ec9",
    destinationFieldId: "3b0f0be7-438c-4129-9e4a-dad32effdc57",
  },
  {
    sourceFieldId: "fb911467-4b4e-468a-8769-e98be89594ff",
    destinationFieldId: "436b89e7-a566-487b-becb-8e0091893a14",
  },
  {
    sourceFieldId: "d4495e14-269b-48c0-a649-42fcc7427af8",
    destinationFieldId: DESTINATION_SELLER_FIELD_ID,
  },
];

function findFieldValue(
  fields: readonly ClickUpAutomationWebhookField[] | undefined,
  sourceFieldId: string,
) {
  const field = fields?.find(
    (candidate) =>
      candidate.field_id === sourceFieldId && candidate.value_deleted !== true,
  );

  if (!field || field.value === undefined || field.value === null) {
    return undefined;
  }

  return {
    value: field.value,
    valueOptions: field.value_options ?? undefined,
  };
}

function buildDestinationFieldValue(
  destinationFieldId: string,
  sourceValue: unknown,
) {
  if (destinationFieldId === DESTINATION_SELLER_FIELD_ID) {
    return {
      add: Array.isArray(sourceValue) ? sourceValue : [sourceValue],
    };
  }

  return sourceValue;
}

function parseTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return undefined;
}

function parseAssigneesList(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parts = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (parts.length === 0) {
    return undefined;
  }

  const assignees = parts.map((entry) => Number(entry));

  if (
    assignees.some(
      (assigneeId) =>
        !Number.isInteger(assigneeId) || !Number.isSafeInteger(assigneeId),
    )
  ) {
    return undefined;
  }

  return assignees;
}

export function buildPartnerCommissionTaskInput(
  payload: ClickUpAutomationWebhookPayload,
  dependencies: Pick<
    PartnerCommissionTaskCommandDependencies,
    "assigneesList" | "destinationCustomItemId" | "destinationStatus" | "now"
  > = {},
): CreateClickUpTaskInput {
  const destinationCustomItemId =
    dependencies.destinationCustomItemId ?? DEFAULT_DESTINATION_CUSTOM_ITEM_ID;
  const destinationStatus =
    dependencies.destinationStatus ?? DEFAULT_DESTINATION_STATUS;
  const now = dependencies.now ?? Date.now;
  const assigneesList = dependencies.assigneesList ?? Bun.env.ASSIGNEES_LIST;
  const firstPaymentDate = parseTimestamp(
    findFieldValue(payload.payload.fields, FIRST_PAYMENT_DATE_FIELD_ID)?.value,
  );
  const startDate = parseTimestamp(payload.payload.time_mgmt?.date_created);
  const dueDateBase = firstPaymentDate ?? now();
  const assignees = parseAssigneesList(assigneesList);

  if (assigneesList && !assignees) {
    console.warn(
      "ASSIGNEES_LIST is invalid; creating the task without assignees.",
      { assigneesList },
    );
  }

  return {
    name: payload.payload.name,
    status: destinationStatus,
    customItemId: destinationCustomItemId,
    tags: payload.payload.tags,
    startDate,
    dueDate: dueDateBase + DUE_DATE_OFFSET_IN_MS,
    priority: DEFAULT_TASK_PRIORITY,
    assignees,
  };
}

export function buildPartnerCommissionCustomFieldUpdates(
  payload: ClickUpAutomationWebhookPayload,
): CustomFieldUpdate[] {
  const mappedFieldUpdates = FIELD_MAPPINGS.flatMap((mapping) => {
    const sourceValue = findFieldValue(
      payload.payload.fields,
      mapping.sourceFieldId,
    );

    if (!sourceValue) {
      return [];
    }

    return [
      {
        fieldId: mapping.destinationFieldId,
        value: buildDestinationFieldValue(
          mapping.destinationFieldId,
          sourceValue.value,
        ),
        valueOptions: sourceValue.valueOptions,
      },
    ];
  });

  return [
    ...mappedFieldUpdates,
    {
      fieldId: DESTINATION_CLIENT_RELATIONSHIP_FIELD_ID,
      value: {
        add: [payload.payload.id],
      },
      valueOptions: undefined,
    },
  ];
}

export function createPartnerCommissionTaskCommand(
  dependencies: PartnerCommissionTaskCommandDependencies = {},
): ClickUpAutomationWebhookCommand {
  return async (payload) => {
    const clickUpClient = dependencies.clickUpClient ?? createClickUpClient();
    const createdTask = await clickUpClient.createTask(
      buildPartnerCommissionTaskInput(payload, dependencies),
    );

    const customFieldUpdates = buildPartnerCommissionCustomFieldUpdates(payload);

    for (const customFieldUpdate of customFieldUpdates) {
      await clickUpClient.setCustomFieldValue({
        taskId: createdTask.id,
        fieldId: customFieldUpdate.fieldId,
        value: customFieldUpdate.value,
        valueOptions: customFieldUpdate.valueOptions,
      });
    }
  };
}

export const createPartnerCommissionTask =
  createPartnerCommissionTaskCommand();
