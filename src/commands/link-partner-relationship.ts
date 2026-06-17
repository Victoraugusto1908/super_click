import { type ClickUpAutomationWebhookCommand } from "./create-partner-commission-task";
import {
  DESTINATION_COMMISSION_VALUE_FIELD_ID,
  parsePartnerCommissionAmount,
} from "./partner-commission-task-shared";
import type {
  ClickUpAutomationWebhookField,
  ClickUpAutomationWebhookPayload,
} from "../types/clickup-webhook";
import {
  createClickUpClient,
  type ClickUpClient,
  type ClickUpTask,
  type ClickUpTaskCustomField,
} from "../utils/clickup";

type ConsoleLike = Pick<Console, "log">;

type LinkPartnerRelationshipDependencies = {
  clickUpClient?: ClickUpClient;
  logger?: ConsoleLike;
  partnersListId?: string;
};

export const PARTNER_FIELD_ID = "9dad0502-6c3a-4aff-bb58-ddcc8857ebb0";
export const DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID =
  "a752cd26-7110-4886-928c-ff8659998a04";
export const COMMISSION_RULE_FIELD_ID = "7c8d448e-6b4c-4e66-a12a-63a9d73469e0";
export const SN_ALIQUOTA_FIELD_ID = "c5883c61-afa7-4e36-a90d-ce40e77d75c5";

function findPayloadField(
  fields: readonly ClickUpAutomationWebhookField[] | undefined,
  fieldId: string,
) {
  return fields?.find((field) => field.field_id === fieldId);
}

function extractPayloadFieldValue(
  payload: ClickUpAutomationWebhookPayload,
  fieldId: string,
) {
  const field = findPayloadField(payload.payload.fields, fieldId);

  if (
    !field ||
    field.value_deleted === true ||
    field.value === undefined ||
    field.value === null ||
    field.value === ""
  ) {
    return undefined;
  }

  return field.value;
}

function extractPayloadPartnerValue(
  payload: ClickUpAutomationWebhookPayload,
): string | undefined {
  const fieldValue = extractPayloadFieldValue(payload, PARTNER_FIELD_ID);

  return fieldValue === undefined
    ? undefined
    : typeof fieldValue === "string"
      ? fieldValue
      : String(fieldValue);
}

export function findTaskCustomField(
  task: ClickUpTask,
  fieldId: string,
): ClickUpTaskCustomField | undefined {
  return task.custom_fields?.find((field) => field.id === fieldId);
}

export function normalizePartnerFieldValue(
  customField: ClickUpTaskCustomField | undefined,
): string | undefined {
  if (!customField) {
    return undefined;
  }

  if (typeof customField.value === "string") {
    if (customField.value.length > 0 && !/^\d+$/.test(customField.value)) {
      return customField.value;
    }

    const numericValue = Number(customField.value);

    if (!Number.isInteger(numericValue)) {
      return undefined;
    }

    const option = customField.type_config?.options?.[numericValue];

    return typeof option?.id === "string" ? option.id : undefined;
  }

  if (typeof customField.value === "number") {
    if (!Number.isInteger(customField.value)) {
      return undefined;
    }

    const option = customField.type_config?.options?.[customField.value];

    return typeof option?.id === "string" ? option.id : undefined;
  }

  return undefined;
}

export function findMatchingPartnerTask(
  tasks: readonly ClickUpTask[],
  partnerValue: string,
): ClickUpTask | undefined {
  return tasks.find((task) => {
    const customField = findTaskCustomField(task, PARTNER_FIELD_ID);

    return normalizePartnerFieldValue(customField) === partnerValue;
  });
}

export function extractCommissionRuleValue(
  task: ClickUpTask,
): string | undefined {
  const customField = findTaskCustomField(task, COMMISSION_RULE_FIELD_ID);

  if (customField?.value === undefined || customField.value === null) {
    return undefined;
  }

  return typeof customField.value === "string"
    ? customField.value
    : String(customField.value);
}

function extractSnAliquotaPercentage(
  payload: ClickUpAutomationWebhookPayload,
): number | undefined {
  const fieldValue = extractPayloadFieldValue(payload, SN_ALIQUOTA_FIELD_ID);

  if (fieldValue === undefined) {
    return undefined;
  }

  const numericValue =
    typeof fieldValue === "number"
      ? fieldValue
      : typeof fieldValue === "string" && fieldValue.trim().length > 0
        ? Number(fieldValue.trim())
        : Number.NaN;

  if (!Number.isFinite(numericValue) || numericValue === 0) {
    return undefined;
  }

  if (numericValue < 0 || numericValue > 100) {
    return undefined;
  }

  return numericValue;
}

function roundCurrencyAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function commentMissingCommissionValue(
  clickUpClient: ClickUpClient,
  taskId: string,
  snAliquotaPercentage: number,
) {
  await clickUpClient.createTaskComment({
    taskId,
    commentText:
      `Não foi possível informar Valor Comissão. ` +
      `A alíquota de SN (${snAliquotaPercentage}%) foi recebida, mas o campo Valor Comissão está vazio na task.`,
    notifyAll: false,
  });
}

async function handlePartnerRelationshipUpdate(
  payload: ClickUpAutomationWebhookPayload,
  dependencies: {
    clickUpClient: ClickUpClient;
    logger: ConsoleLike;
    partnersListId: string;
  },
) {
  const { clickUpClient, logger, partnersListId } = dependencies;
  const partnerValue = extractPayloadPartnerValue(payload);

  if (!partnerValue) {
    return;
  }

  const partnerTasks = await clickUpClient.getAllTasksFromList(partnersListId);
  const matchedPartnerTask = findMatchingPartnerTask(partnerTasks, partnerValue);

  if (!matchedPartnerTask) {
    logger.log("No matching partner task found for automation payload.", {
      taskId: payload.payload.id,
      partnerFieldId: PARTNER_FIELD_ID,
      partnerValue,
      partnersListId,
    });
    return;
  }

  await clickUpClient.setCustomFieldValue({
    taskId: payload.payload.id,
    fieldId: DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID,
    value: {
      add: [matchedPartnerTask.id],
    },
  });

  const commissionRuleValue = extractCommissionRuleValue(matchedPartnerTask);

  if (commissionRuleValue !== undefined) {
    await clickUpClient.setCustomFieldValue({
      taskId: payload.payload.id,
      fieldId: COMMISSION_RULE_FIELD_ID,
      value: commissionRuleValue,
    });
  }
}

async function handleSnAliquotaDiscountUpdate(
  payload: ClickUpAutomationWebhookPayload,
  dependencies: {
    clickUpClient: ClickUpClient;
    logger: ConsoleLike;
  },
) {
  const { clickUpClient, logger } = dependencies;
  const snAliquotaPercentage = extractSnAliquotaPercentage(payload);

  if (snAliquotaPercentage === undefined) {
    return;
  }

  const sourceTask = await clickUpClient.getTask(payload.payload.id);
  const currentCommissionField = findTaskCustomField(
    sourceTask,
    DESTINATION_COMMISSION_VALUE_FIELD_ID,
  );
  const currentCommissionValue = currentCommissionField?.value;
  const currentCommissionAmount = parsePartnerCommissionAmount(
    currentCommissionValue,
  );

  if (currentCommissionAmount === undefined) {
    if (
      currentCommissionValue === undefined ||
      currentCommissionValue === null ||
      currentCommissionValue === ""
    ) {
      await commentMissingCommissionValue(
        clickUpClient,
        payload.payload.id,
        snAliquotaPercentage,
      );
    }

    logger.log("Skipping SN aliquota commission recalculation due to invalid base value.", {
      taskId: payload.payload.id,
      commissionFieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
      currentCommissionValue: currentCommissionValue ?? null,
      snAliquotaFieldId: SN_ALIQUOTA_FIELD_ID,
      snAliquotaPercentage,
    });
    return;
  }

  const discountedCommissionAmount = roundCurrencyAmount(
    currentCommissionAmount * (1 - snAliquotaPercentage / 100),
  );

  await clickUpClient.setCustomFieldValue({
    taskId: payload.payload.id,
    fieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
    value: discountedCommissionAmount.toFixed(2),
  });
}

export function createLinkPartnerRelationshipCommand(
  dependencies: LinkPartnerRelationshipDependencies = {},
): ClickUpAutomationWebhookCommand {
  return async (payload) => {
    const clickUpClient = dependencies.clickUpClient ?? createClickUpClient();
    const logger = dependencies.logger ?? console;
    const partnersListId =
      dependencies.partnersListId ?? Bun.env.PARTNERS_LIST?.trim();

    if (!partnersListId) {
      throw new Error("PARTNERS_LIST is not configured");
    }

    await handlePartnerRelationshipUpdate(payload, {
      clickUpClient,
      logger,
      partnersListId,
    });
    await handleSnAliquotaDiscountUpdate(payload, {
      clickUpClient,
      logger,
    });
  };
}

export const linkPartnerRelationship = createLinkPartnerRelationshipCommand();
