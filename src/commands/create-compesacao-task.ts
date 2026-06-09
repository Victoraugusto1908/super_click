import {
  COMMISSION_RULE_FIELD_ID,
  DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID,
  PARTNER_FIELD_ID,
  extractCommissionRuleValue,
  findMatchingPartnerTask,
  findTaskCustomField,
  normalizePartnerFieldValue,
} from "./link-partner-relationship";
import {
  DESTINATION_CNPJ_FIELD_ID,
  DESTINATION_RAZAO_SOCIAL_FIELD_ID,
  SOURCE_CNPJ_FIELD_ID,
  SOURCE_RAZAO_SOCIAL_FIELD_ID,
  buildPartnerCommissionCustomFieldUpdatesFromSource,
  buildPartnerCommissionTaskInputFromSource,
  findNormalizedFieldValue,
  normalizeClickUpTask,
  type CustomFieldUpdate,
  type PartnerCommissionTaskCommandDependencies,
} from "./partner-commission-task-shared";
import { findTriggeredCompensacaoField } from "../constants/compensacao-trigger-map";
import type { ClickUpTaskUpdatedWebhookPayload } from "../types/clickup-webhook";
import {
  createClickUpClient,
  type ClickUpClient,
  type ClickUpTask,
  type ClickUpTaskCustomField,
} from "../utils/clickup";

type ConsoleLike = Pick<Console, "log">;

type CreateCompesacaoTaskDependencies = PartnerCommissionTaskCommandDependencies & {
  clickUpClient?: ClickUpClient;
  compesacaoListId?: string;
  logger?: ConsoleLike;
  partnersListId?: string;
};

export type ClickUpTaskUpdatedWebhookCommand = (
  payload: ClickUpTaskUpdatedWebhookPayload,
) => Promise<void>;

const RELATED_CLIENT_FIELD_ID = "49414079-b1ff-4644-ac85-71a5448424cc";
const DESTINATION_AMOUNT_FIELD_ID = "acbf6ea7-cc78-4bd1-b7b1-6dda5f36ba81";

type RelatedTaskReferenceValue = {
  id?: string;
  [key: string]: unknown;
};

type CompesacaoOverrideUpdatesResult = {
  overrideUpdates: CustomFieldUpdate[];
  missingTriggeredAmountField?: {
    actionFieldId: string;
    valueFieldId: string;
  };
};

function isRelatedTaskReferenceValue(
  value: unknown,
): value is RelatedTaskReferenceValue {
  return typeof value === "object" && value !== null;
}

function extractFirstRelationshipTaskId(
  customField: ClickUpTaskCustomField | undefined,
): string | undefined {
  if (!customField || !Array.isArray(customField.value)) {
    return undefined;
  }

  const firstValue = customField.value.find(isRelatedTaskReferenceValue);

  return typeof firstValue?.id === "string" ? firstValue.id : undefined;
}

function findFirstLinkedTaskId(sourceTask: ClickUpTask) {
  const firstLinkedTask = sourceTask.linked_tasks?.[0];

  return typeof firstLinkedTask?.link_id === "string"
    ? firstLinkedTask.link_id
    : undefined;
}

async function commentAndAbort(
  clickUpClient: ClickUpClient,
  sourceTaskId: string,
  stage: string,
  details: Record<string, string | undefined>,
) {
  const renderedDetails = Object.entries(details)
    .flatMap(([key, value]) => (value ? [`${key}=${value}`] : []))
    .join(" ");
  const commentText =
    renderedDetails.length > 0
      ? `Fluxo COMPESACAO interrompido: não foi possível resolver ${stage}. ${renderedDetails}`
      : `Fluxo COMPESACAO interrompido: não foi possível resolver ${stage}.`;

  await clickUpClient.createTaskComment({
    taskId: sourceTaskId,
    commentText,
    notifyAll: false,
  });
}

function buildCompesacaoOverrideUpdates(
  sourceTask: ClickUpTask,
  payload: ClickUpTaskUpdatedWebhookPayload,
): CompesacaoOverrideUpdatesResult {
  const normalizedCompesacaoTask = normalizeClickUpTask(sourceTask);
  const overrideUpdates: CustomFieldUpdate[] = [];
  const triggeredCompensacaoField = findTriggeredCompensacaoField(
    payload.history_items,
  );
  const razaoSocialValue = findNormalizedFieldValue(
    normalizedCompesacaoTask.fields,
    SOURCE_RAZAO_SOCIAL_FIELD_ID,
  );
  const cnpjValue = findNormalizedFieldValue(
    normalizedCompesacaoTask.fields,
    SOURCE_CNPJ_FIELD_ID,
  );

  if (razaoSocialValue) {
    overrideUpdates.push({
      fieldId: DESTINATION_RAZAO_SOCIAL_FIELD_ID,
      value: razaoSocialValue.value,
      valueOptions: razaoSocialValue.valueOptions,
    });
  }

  if (cnpjValue) {
    overrideUpdates.push({
      fieldId: DESTINATION_CNPJ_FIELD_ID,
      value: cnpjValue.value,
      valueOptions: cnpjValue.valueOptions,
    });
  }

  if (triggeredCompensacaoField) {
    const triggeredAmountField = findTaskCustomField(
      sourceTask,
      triggeredCompensacaoField.valueFieldId,
    );

    if (
      triggeredAmountField?.value !== undefined &&
      triggeredAmountField.value !== null &&
      triggeredAmountField.value !== ""
    ) {
      overrideUpdates.push({
        fieldId: DESTINATION_AMOUNT_FIELD_ID,
        value: triggeredAmountField.value,
      });
    } else {
      return {
        overrideUpdates,
        missingTriggeredAmountField: {
          actionFieldId: triggeredCompensacaoField.actionFieldId,
          valueFieldId: triggeredCompensacaoField.valueFieldId,
        },
      };
    }
  }

  return {
    overrideUpdates,
  };
}

function resolveClientPartnerValue(clientTask: ClickUpTask): string | undefined {
  return normalizePartnerFieldValue(findTaskCustomField(clientTask, PARTNER_FIELD_ID));
}

export function createCompesacaoTaskCommand(
  dependencies: CreateCompesacaoTaskDependencies = {},
): ClickUpTaskUpdatedWebhookCommand {
  return async (payload) => {
    const clickUpClient = dependencies.clickUpClient ?? createClickUpClient();
    const logger = dependencies.logger ?? console;
    const compesacaoListId =
      dependencies.compesacaoListId ?? Bun.env.COMPESACAO?.trim();
    const partnersListId =
      dependencies.partnersListId ?? Bun.env.PARTNERS_LIST?.trim();

    if (!compesacaoListId) {
      throw new Error("COMPESACAO is not configured");
    }

    if (!partnersListId) {
      throw new Error("PARTNERS_LIST is not configured");
    }

    const sourceTask = await clickUpClient.getTask(payload.task_id);

    if (sourceTask.list?.id !== compesacaoListId) {
      logger.log("Ignoring COMPESACAO webhook for task outside configured list.", {
        taskId: sourceTask.id,
        taskListId: sourceTask.list?.id,
        compesacaoListId,
      });
      return;
    }

    const linkedTaskId = findFirstLinkedTaskId(sourceTask);

    if (!linkedTaskId) {
      await commentAndAbort(clickUpClient, sourceTask.id, "task relacionada", {
        sourceTaskId: sourceTask.id,
      });
      return;
    }

    const relatedTask = await clickUpClient.getTask(linkedTaskId);
    const relatedClientField = findTaskCustomField(relatedTask, RELATED_CLIENT_FIELD_ID);
    const clientTaskId = extractFirstRelationshipTaskId(relatedClientField);

    if (!clientTaskId) {
      await commentAndAbort(clickUpClient, sourceTask.id, "cliente vinculado", {
        sourceTaskId: sourceTask.id,
        relatedTaskId: relatedTask.id,
        relatedClientFieldId: RELATED_CLIENT_FIELD_ID,
      });
      return;
    }

    const clientTask = await clickUpClient.getTask(clientTaskId);
    const clientPartnerValue = resolveClientPartnerValue(clientTask);

    if (!clientPartnerValue) {
      await commentAndAbort(
        clickUpClient,
        sourceTask.id,
        "parceiro na task do cliente",
        {
          sourceTaskId: sourceTask.id,
          relatedTaskId: relatedTask.id,
          clientTaskId: clientTask.id,
          partnerFieldId: PARTNER_FIELD_ID,
        },
      );
      return;
    }

    const partnerTasks = await clickUpClient.getAllTasksFromList(partnersListId);
    const matchedPartnerTask = findMatchingPartnerTask(
      partnerTasks,
      clientPartnerValue,
    );

    if (!matchedPartnerTask) {
      logger.log("No matching partner task found for COMPESACAO webhook.", {
        taskId: sourceTask.id,
        clientTaskId: clientTask.id,
        partnerFieldId: PARTNER_FIELD_ID,
        partnerValue: clientPartnerValue,
        partnersListId,
      });
      await commentAndAbort(clickUpClient, sourceTask.id, "parceiro correspondente", {
        sourceTaskId: sourceTask.id,
        clientTaskId: clientTask.id,
        partnerFieldId: PARTNER_FIELD_ID,
        partnerValue: clientPartnerValue,
        partnersListId,
      });
      return;
    }

    const normalizedClientTask = normalizeClickUpTask(clientTask);
    const createdTask = await clickUpClient.createTask(
      buildPartnerCommissionTaskInputFromSource(
        normalizedClientTask,
        dependencies,
      ),
    );
    const compesacaoOverrides = buildCompesacaoOverrideUpdates(sourceTask, payload);
    const customFieldUpdates = buildPartnerCommissionCustomFieldUpdatesFromSource(
      normalizedClientTask,
      {
        clientRelationshipTaskId: clientTask.id,
        overrideUpdates: compesacaoOverrides.overrideUpdates,
      },
    );

    customFieldUpdates.push({
      fieldId: DESTINATION_PARTNER_RELATIONSHIP_FIELD_ID,
      value: {
        add: [matchedPartnerTask.id],
      },
    });

    const commissionRuleValue = extractCommissionRuleValue(matchedPartnerTask);

    if (commissionRuleValue !== undefined) {
      customFieldUpdates.push({
        fieldId: COMMISSION_RULE_FIELD_ID,
        value: commissionRuleValue,
      });
    }

    for (const customFieldUpdate of customFieldUpdates) {
      await clickUpClient.setCustomFieldValue({
        taskId: createdTask.id,
        fieldId: customFieldUpdate.fieldId,
        value: customFieldUpdate.value,
        valueOptions: customFieldUpdate.valueOptions,
      });
    }

    if (compesacaoOverrides.missingTriggeredAmountField) {
      await clickUpClient.createTaskComment({
        taskId: sourceTask.id,
        commentText:
          "Fluxo COMPESACAO criou a task de destino sem valor compensado/restituído. " +
          `sourceTaskId=${sourceTask.id} ` +
          `actionFieldId=${compesacaoOverrides.missingTriggeredAmountField.actionFieldId} ` +
          `valueFieldId=${compesacaoOverrides.missingTriggeredAmountField.valueFieldId}`,
        notifyAll: false,
      });
    }
  };
}

export const createCompesacaoTask = createCompesacaoTaskCommand();
