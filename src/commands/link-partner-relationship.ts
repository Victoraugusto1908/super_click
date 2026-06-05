import { type ClickUpAutomationWebhookCommand } from "./create-partner-commission-task";
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

function findPayloadField(
  fields: readonly ClickUpAutomationWebhookField[] | undefined,
  fieldId: string,
) {
  return fields?.find((field) => field.field_id === fieldId);
}

function extractPayloadPartnerValue(
  payload: ClickUpAutomationWebhookPayload,
): string | undefined {
  const field = findPayloadField(payload.payload.fields, PARTNER_FIELD_ID);

  if (
    !field ||
    field.value_deleted === true ||
    field.value === undefined ||
    field.value === null ||
    field.value === ""
  ) {
    return undefined;
  }

  return typeof field.value === "string" ? field.value : String(field.value);
}

function findTaskCustomField(
  task: ClickUpTask,
  fieldId: string,
): ClickUpTaskCustomField | undefined {
  return task.custom_fields?.find((field) => field.id === fieldId);
}

function normalizePartnerFieldValue(
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

function findMatchingPartnerTask(
  tasks: readonly ClickUpTask[],
  partnerValue: string,
): ClickUpTask | undefined {
  return tasks.find((task) => {
    const customField = findTaskCustomField(task, PARTNER_FIELD_ID);

    return normalizePartnerFieldValue(customField) === partnerValue;
  });
}

function extractCommissionRuleValue(task: ClickUpTask): string | undefined {
  const customField = findTaskCustomField(task, COMMISSION_RULE_FIELD_ID);

  if (customField?.value === undefined || customField.value === null) {
    return undefined;
  }

  return typeof customField.value === "string"
    ? customField.value
    : String(customField.value);
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
  };
}

export const linkPartnerRelationship = createLinkPartnerRelationshipCommand();
