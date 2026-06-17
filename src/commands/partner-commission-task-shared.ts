import type {
  ClickUpAutomationWebhookPayload,
} from "../types/clickup-webhook";
import type {
  ClickUpTask,
  CreateClickUpTaskInput,
} from "../utils/clickup";

export type PartnerCommissionTaskCommandDependencies = {
  destinationCustomItemId?: number;
  destinationStatus?: string;
  assigneesList?: string;
  now?: () => number;
};

type FieldMapping = {
  sourceFieldId: string;
  destinationFieldId: string;
};

export type CustomFieldUpdate = {
  fieldId: string;
  value: unknown;
  valueOptions?: Record<string, unknown>;
};

export type NormalizedTaskField = {
  fieldId: string;
  value: unknown;
  valueOptions?: Record<string, unknown>;
};

export type NormalizedTaskSource = {
  id: string;
  name: string;
  tags?: string[];
  dateCreated?: string | number | null;
  fields: NormalizedTaskField[];
};

export const DEFAULT_DESTINATION_CUSTOM_ITEM_ID = 1009;
export const DEFAULT_DESTINATION_STATUS = "pendente";
export const DEFAULT_TASK_PRIORITY = 2;
export const DUE_DATE_OFFSET_IN_MS = 5 * 24 * 60 * 60 * 1000;
export const DESTINATION_CLIENT_RELATIONSHIP_FIELD_ID =
  "2bfd292d-e0c9-486f-8fd1-e5f6e37654b7";
export const DESTINATION_SELLER_FIELD_ID =
  "ec16180c-8ece-4a86-8d8d-4cfc9965fbd1";
export const DESTINATION_RAZAO_SOCIAL_FIELD_ID =
  "3b0f0be7-438c-4129-9e4a-dad32effdc57";
export const DESTINATION_CNPJ_FIELD_ID =
  "436b89e7-a566-487b-becb-8e0091893a14";
export const DESTINATION_PAYMENT_PARTNER_FIELD_ID =
  "3cbadb57-3c91-41b0-bba6-d072fa60438e";
export const DESTINATION_COMMISSION_VALUE_FIELD_ID =
  "36323f4b-8384-443b-819b-e8e5b67370c3";
export const FIRST_PAYMENT_DATE_FIELD_ID =
  "ddb374d1-6293-4d9c-b907-447bf123c38a";
export const PAYMENT_PARTNER_DATE_OFFSET_IN_MS = 10 * 24 * 60 * 60 * 1000;
export const SOURCE_FIRST_PAYMENT_AMOUNT_FIELD_ID =
  "11a7f636-c49e-4423-b9d5-85fb4fc2fd52";
export const SOURCE_RAZAO_SOCIAL_FIELD_ID =
  "14fb928b-77fe-4d9b-8979-93ebc14b5ec9";
export const SOURCE_CNPJ_FIELD_ID = "fb911467-4b4e-468a-8769-e98be89594ff";
export const PARTNER_COMMISSION_SERVICE_TAGS = [
  "classificação",
  "conciliação",
  "jurídico",
] as const;

const FIELD_MAPPINGS: readonly FieldMapping[] = [
  {
    sourceFieldId: SOURCE_FIRST_PAYMENT_AMOUNT_FIELD_ID,
    destinationFieldId: SOURCE_FIRST_PAYMENT_AMOUNT_FIELD_ID,
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
    sourceFieldId: SOURCE_RAZAO_SOCIAL_FIELD_ID,
    destinationFieldId: DESTINATION_RAZAO_SOCIAL_FIELD_ID,
  },
  {
    sourceFieldId: SOURCE_CNPJ_FIELD_ID,
    destinationFieldId: DESTINATION_CNPJ_FIELD_ID,
  },
  {
    sourceFieldId: "d4495e14-269b-48c0-a649-42fcc7427af8",
    destinationFieldId: DESTINATION_SELLER_FIELD_ID,
  },
];

function normalizeTaskTags(tags: unknown): string[] | undefined {
  if (!Array.isArray(tags)) {
    return undefined;
  }

  const normalizedTags = tags
    .flatMap((tag) => {
      if (typeof tag === "string") {
        return tag;
      }

      if (
        typeof tag === "object" &&
        tag !== null &&
        "name" in tag &&
        typeof tag.name === "string"
      ) {
        return tag.name;
      }

      return [];
    })
    .filter((tag) => tag.length > 0);

  return normalizedTags.length > 0 ? normalizedTags : undefined;
}

export function normalizeAutomationPayloadTask(
  payload: ClickUpAutomationWebhookPayload,
): NormalizedTaskSource {
  return {
    id: payload.payload.id,
    name: payload.payload.name,
    tags: payload.payload.tags,
    dateCreated: payload.payload.time_mgmt?.date_created,
    fields:
      payload.payload.fields?.flatMap((field) => {
        if (
          field.value_deleted === true ||
          field.value === undefined ||
          field.value === null
        ) {
          return [];
        }

        return [
          {
            fieldId: field.field_id,
            value: field.value,
            valueOptions: field.value_options ?? undefined,
          },
        ];
      }) ?? [],
  };
}

export function normalizeClickUpTask(task: ClickUpTask): NormalizedTaskSource {
  return {
    id: task.id,
    name: typeof task.name === "string" ? task.name : task.id,
    tags: normalizeTaskTags(task.tags),
    dateCreated:
      typeof task.date_created === "string" || typeof task.date_created === "number"
        ? task.date_created
        : undefined,
    fields:
      task.custom_fields?.flatMap((field) => {
        if (field.value === undefined || field.value === null) {
          return [];
        }

        return [
          {
            fieldId: field.id,
            value: field.value,
          },
        ];
      }) ?? [],
  };
}

export function findNormalizedFieldValue(
  fields: readonly NormalizedTaskField[] | undefined,
  sourceFieldId: string,
) {
  const field = fields?.find((candidate) => candidate.fieldId === sourceFieldId);

  if (!field || field.value === undefined || field.value === null) {
    return undefined;
  }

  return {
    value: field.value,
    valueOptions: field.valueOptions,
  };
}

function buildDestinationFieldValue(
  destinationFieldId: string,
  sourceValue: unknown,
) {
  if (destinationFieldId === DESTINATION_SELLER_FIELD_ID) {
    const normalizedSellerIds = Array.isArray(sourceValue)
      ? sourceValue.flatMap((entry) => {
          if (typeof entry === "number") {
            return entry;
          }

          if (
            typeof entry === "object" &&
            entry !== null &&
            "id" in entry &&
            typeof entry.id === "number"
          ) {
            return entry.id;
          }

          return [];
        })
      : [sourceValue];

    return {
      add: normalizedSellerIds,
    };
  }

  return sourceValue;
}

export function parseTimestamp(value: unknown) {
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

export function parseAssigneesList(value: string | undefined) {
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

export function resolveEligiblePartnerCommissionServiceTags(
  tags: readonly string[] | undefined,
) {
  if (!tags || tags.length === 0) {
    return [];
  }

  const supportedTags = new Set<string>(PARTNER_COMMISSION_SERVICE_TAGS);
  const eligibleTags: string[] = [];
  const seenTags = new Set<string>();

  for (const tag of tags) {
    if (!supportedTags.has(tag) || seenTags.has(tag)) {
      continue;
    }

    eligibleTags.push(tag);
    seenTags.add(tag);
  }

  return eligibleTags;
}

export function buildPartnerCommissionTaskInputFromSource(
  source: NormalizedTaskSource,
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
    findNormalizedFieldValue(source.fields, FIRST_PAYMENT_DATE_FIELD_ID)?.value,
  );
  const startDate = parseTimestamp(source.dateCreated);
  const dueDateBase = firstPaymentDate ?? now();
  const assignees = parseAssigneesList(assigneesList);

  if (assigneesList && !assignees) {
    console.warn(
      "ASSIGNEES_LIST is invalid; creating the task without assignees.",
      { assigneesList },
    );
  }

  return {
    name: source.name,
    status: destinationStatus,
    customItemId: destinationCustomItemId,
    tags: source.tags,
    startDate,
    dueDate: dueDateBase + DUE_DATE_OFFSET_IN_MS,
    priority: DEFAULT_TASK_PRIORITY,
    assignees,
  };
}

export function buildPartnerCommissionTaskInputForServiceFromSource(
  source: NormalizedTaskSource,
  serviceTag: string,
  dependencies: Pick<
    PartnerCommissionTaskCommandDependencies,
    "assigneesList" | "destinationCustomItemId" | "destinationStatus" | "now"
  > = {},
): CreateClickUpTaskInput {
  return {
    ...buildPartnerCommissionTaskInputFromSource(source, dependencies),
    tags: [serviceTag],
  };
}

export function findPartnerCommissionSourceValue(source: NormalizedTaskSource) {
  return findNormalizedFieldValue(source.fields, SOURCE_FIRST_PAYMENT_AMOUNT_FIELD_ID)
    ?.value;
}

function normalizeMoneyIntegerPart(value: string) {
  const normalizedValue = value.replace(/^0+(?=\d)/, "");

  return normalizedValue.length > 0 ? normalizedValue : "0";
}

function normalizeMoneyWithSingleSeparator(
  value: string,
  separator: "." | ",",
) {
  const parts = value.split(separator);

  if (parts.length === 1) {
    return normalizeMoneyIntegerPart(parts[0] ?? "");
  }

  if (
    parts.length === 2 &&
    parts[0] &&
    parts[1] &&
    /^\d+$/.test(parts[0]) &&
    /^\d+$/.test(parts[1]) &&
    parts[1].length <= 2
  ) {
    return `${normalizeMoneyIntegerPart(parts[0])}.${parts[1]}`;
  }

  return parts.join("");
}

function normalizeMoneyWithMixedSeparators(value: string) {
  const lastCommaIndex = value.lastIndexOf(",");
  const lastDotIndex = value.lastIndexOf(".");
  const decimalSeparator = lastCommaIndex > lastDotIndex ? "," : ".";
  const thousandSeparator = decimalSeparator === "," ? "." : ",";
  const compactValue = value.split(thousandSeparator).join("");

  return normalizeMoneyWithSingleSeparator(compactValue, decimalSeparator);
}

export function normalizePartnerCommissionValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const compactValue = value.replace(/^R\$\s*/i, "").replace(/\s+/g, "").trim();

  if (compactValue.length === 0 || !/^[\d.,]+$/.test(compactValue)) {
    return undefined;
  }

  const normalizedValue =
    compactValue.includes(",") && compactValue.includes(".")
      ? normalizeMoneyWithMixedSeparators(compactValue)
      : compactValue.includes(",")
        ? normalizeMoneyWithSingleSeparator(compactValue, ",")
        : compactValue.includes(".")
          ? normalizeMoneyWithSingleSeparator(compactValue, ".")
          : normalizeMoneyIntegerPart(compactValue);

  return /^\d+(\.\d{1,2})?$/.test(normalizedValue)
    ? normalizedValue
    : undefined;
}

export function parsePartnerCommissionAmount(value: unknown) {
  const normalizedValue = normalizePartnerCommissionValue(value);

  if (!normalizedValue) {
    return undefined;
  }

  const numericValue = Number(normalizedValue);

  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function mergeCustomFieldUpdates(
  baseUpdates: readonly CustomFieldUpdate[],
  overrideUpdates: readonly CustomFieldUpdate[],
) {
  if (overrideUpdates.length === 0) {
    return [...baseUpdates];
  }

  const overrideFieldIds = new Set(
    overrideUpdates.map((overrideUpdate) => overrideUpdate.fieldId),
  );

  return [
    ...baseUpdates.filter((update) => !overrideFieldIds.has(update.fieldId)),
    ...overrideUpdates,
  ];
}

export function buildPartnerCommissionCustomFieldUpdatesFromSource(
  source: NormalizedTaskSource,
  options: {
    clientRelationshipTaskId: string;
    overrideUpdates?: readonly CustomFieldUpdate[];
  },
): CustomFieldUpdate[] {
  const mappedFieldUpdates: CustomFieldUpdate[] = [];

  for (const mapping of FIELD_MAPPINGS) {
    const sourceValue = findNormalizedFieldValue(source.fields, mapping.sourceFieldId);

    if (!sourceValue) {
      continue;
    }

    mappedFieldUpdates.push({
      fieldId: mapping.destinationFieldId,
      value: buildDestinationFieldValue(
        mapping.destinationFieldId,
        sourceValue.value,
      ),
      valueOptions: sourceValue.valueOptions,
    });

    if (mapping.sourceFieldId === FIRST_PAYMENT_DATE_FIELD_ID) {
      const firstPaymentDate = parseTimestamp(sourceValue.value);

      if (firstPaymentDate !== undefined) {
        mappedFieldUpdates.push({
          fieldId: DESTINATION_PAYMENT_PARTNER_FIELD_ID,
          value: firstPaymentDate + PAYMENT_PARTNER_DATE_OFFSET_IN_MS,
        });
      }
    }
  }

  return mergeCustomFieldUpdates(
    [
      ...mappedFieldUpdates,
      {
        fieldId: DESTINATION_CLIENT_RELATIONSHIP_FIELD_ID,
        value: {
          add: [options.clientRelationshipTaskId],
        },
        valueOptions: undefined,
      },
    ],
    options.overrideUpdates ?? [],
  );
}
