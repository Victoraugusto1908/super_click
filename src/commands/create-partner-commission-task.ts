import type {
  ClickUpAutomationWebhookPayload,
} from "../types/clickup-webhook";
import {
  createClickUpClient,
  type ClickUpClient,
} from "../utils/clickup";
import {
  buildPartnerCommissionCustomFieldUpdatesFromSource,
  buildPartnerCommissionTaskInputFromSource,
  buildPartnerCommissionTaskInputForServiceFromSource,
  DESTINATION_COMMISSION_VALUE_FIELD_ID,
  findPartnerCommissionSourcePartnerValue,
  findPartnerCommissionSourceValue,
  type NormalizedTaskSource,
  normalizePartnerCommissionValue,
  normalizeAutomationPayloadTask,
  PARTNER_FIELD_ID,
  resolveEligiblePartnerCommissionServiceTags,
  shouldPopulateCommissionValue,
  type CustomFieldUpdate,
  type PartnerCommissionTaskCommandDependencies,
} from "./partner-commission-task-shared";

export type ClickUpAutomationWebhookCommand = (
  payload: ClickUpAutomationWebhookPayload,
) => Promise<void>;

type ConsoleLike = Pick<Console, "log">;

type CommandDependencies = PartnerCommissionTaskCommandDependencies & {
  clickUpClient?: ClickUpClient;
  logger?: ConsoleLike;
};

export type PartnerCommissionTaskExecutionDependencies = CommandDependencies;

export function buildPartnerCommissionTaskInput(
  payload: ClickUpAutomationWebhookPayload,
  dependencies: PartnerCommissionTaskCommandDependencies = {},
) {
  const normalizedSource = normalizeAutomationPayloadTask(payload);
  const [firstServiceTag] = resolveEligiblePartnerCommissionServiceTags(
    normalizedSource.tags,
  );

  if (!firstServiceTag) {
    return buildPartnerCommissionTaskInputFromSource(
      normalizedSource,
      dependencies,
    );
  }

  return buildPartnerCommissionTaskInputForServiceFromSource(
    normalizedSource,
    firstServiceTag,
    dependencies,
  );
}

async function commentCommissionValueFailure(
  clickUpClient: ClickUpClient,
  taskId: string,
  rawCommissionValue: unknown,
) {
  const renderedValue =
    rawCommissionValue === undefined ? "vazio" : String(rawCommissionValue);

  await clickUpClient.createTaskComment({
    taskId,
    commentText:
      `Não foi possível informar Valor Comissão. ` +
      `Valor da primeira mensalidade recebido: ${renderedValue}`,
    notifyAll: false,
  });
}

async function setPartnerCommissionValue(
  clickUpClient: ClickUpClient,
  taskId: string,
  rawCommissionValue: unknown,
) {
  if (rawCommissionValue === undefined) {
    return;
  }

  const normalizedCommissionValue =
    normalizePartnerCommissionValue(rawCommissionValue);

  if (normalizedCommissionValue === undefined) {
    await commentCommissionValueFailure(
      clickUpClient,
      taskId,
      rawCommissionValue,
    );
    return;
  }

  try {
    await clickUpClient.setCustomFieldValue({
      taskId,
      fieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
      value: normalizedCommissionValue,
    });
  } catch {
    await commentCommissionValueFailure(clickUpClient, taskId, rawCommissionValue);
  }
}

async function setMappedCustomFields(
  clickUpClient: ClickUpClient,
  taskId: string,
  customFieldUpdates: readonly CustomFieldUpdate[],
) {
  for (const customFieldUpdate of customFieldUpdates) {
    await clickUpClient.setCustomFieldValue({
      taskId,
      fieldId: customFieldUpdate.fieldId,
      value: customFieldUpdate.value,
      valueOptions: customFieldUpdate.valueOptions,
    });
  }
}

export function buildPartnerCommissionCustomFieldUpdates(
  payload: ClickUpAutomationWebhookPayload,
): CustomFieldUpdate[] {
  return buildPartnerCommissionCustomFieldUpdatesFromSource(
    normalizeAutomationPayloadTask(payload),
    {
      clientRelationshipTaskId: payload.payload.id,
    },
  );
}

export async function createPartnerCommissionTasksFromSource(
  normalizedSource: NormalizedTaskSource,
  serviceTags: readonly string[] | undefined,
  dependencies: PartnerCommissionTaskExecutionDependencies = {},
) {
  const clickUpClient = dependencies.clickUpClient ?? createClickUpClient();
  const logger = dependencies.logger ?? console;
  const eligibleServiceTags = resolveEligiblePartnerCommissionServiceTags(
    serviceTags,
  );

  if (eligibleServiceTags.length === 0) {
    return;
  }

  const customFieldUpdates = buildPartnerCommissionCustomFieldUpdatesFromSource(
    normalizedSource,
    {
      clientRelationshipTaskId: normalizedSource.id,
    },
  );
  const partnerOptionId =
    findPartnerCommissionSourcePartnerValue(normalizedSource);
  const rawCommissionValue = findPartnerCommissionSourceValue(normalizedSource);

  for (const serviceTag of eligibleServiceTags) {
    const createdTask = await clickUpClient.createTask(
      buildPartnerCommissionTaskInputForServiceFromSource(
        normalizedSource,
        serviceTag,
        dependencies,
      ),
    );

    await setMappedCustomFields(clickUpClient, createdTask.id, customFieldUpdates);
    if (shouldPopulateCommissionValue(partnerOptionId)) {
      logger.log("Partner is Rede Smart; populating Valor comissão.", {
        sourceTaskId: normalizedSource.id,
        destinationTaskId: createdTask.id,
        partnerFieldId: PARTNER_FIELD_ID,
        partnerValue: partnerOptionId,
        commissionFieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
        serviceTag,
      });
      await setPartnerCommissionValue(
        clickUpClient,
        createdTask.id,
        rawCommissionValue,
      );
    } else {
      logger.log("Partner is not Rede Smart; skipping Valor comissão.", {
        sourceTaskId: normalizedSource.id,
        destinationTaskId: createdTask.id,
        partnerFieldId: PARTNER_FIELD_ID,
        partnerValue: partnerOptionId ?? null,
        commissionFieldId: DESTINATION_COMMISSION_VALUE_FIELD_ID,
        serviceTag,
      });
    }
  }
}

export function createPartnerCommissionTaskCommand(
  dependencies: CommandDependencies = {},
): ClickUpAutomationWebhookCommand {
  return async (payload) => {
    const normalizedSource = normalizeAutomationPayloadTask(payload);
    await createPartnerCommissionTasksFromSource(
      normalizedSource,
      normalizedSource.tags,
      dependencies,
    );
  };
}

export const createPartnerCommissionTask =
  createPartnerCommissionTaskCommand();
