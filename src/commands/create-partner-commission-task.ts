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
  normalizeAutomationPayloadTask,
  type CustomFieldUpdate,
  type PartnerCommissionTaskCommandDependencies,
} from "./partner-commission-task-shared";

export type ClickUpAutomationWebhookCommand = (
  payload: ClickUpAutomationWebhookPayload,
) => Promise<void>;

type CommandDependencies = PartnerCommissionTaskCommandDependencies & {
  clickUpClient?: ClickUpClient;
};

export function buildPartnerCommissionTaskInput(
  payload: ClickUpAutomationWebhookPayload,
  dependencies: PartnerCommissionTaskCommandDependencies = {},
) {
  return buildPartnerCommissionTaskInputFromSource(
    normalizeAutomationPayloadTask(payload),
    dependencies,
  );
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

export function createPartnerCommissionTaskCommand(
  dependencies: CommandDependencies = {},
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
