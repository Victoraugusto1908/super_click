import {
  createPartnerCommissionTask,
  type ClickUpAutomationWebhookCommand,
} from "../commands/create-partner-commission-task";
import {
  isClickUpAutomationWebhookPayload,
  type ClickUpWebhookPayload,
} from "../types/clickup-webhook";

type ConsoleLike = Pick<Console, "warn">;

export type ClickUpWebhookHandler = (
  payload: ClickUpWebhookPayload,
) => Promise<void>;

type ClickUpWebhookDependencies = {
  commandsBySourceListId?: Record<string, ClickUpAutomationWebhookCommand>;
  logger?: ConsoleLike;
  novoClienteCommand?: ClickUpAutomationWebhookCommand;
  novoClienteListId?: string;
};

function buildCommandRegistry(
  dependencies: ClickUpWebhookDependencies,
): Record<string, ClickUpAutomationWebhookCommand> {
  if (dependencies.commandsBySourceListId) {
    return dependencies.commandsBySourceListId;
  }

  const novoClienteListId =
    dependencies.novoClienteListId ?? Bun.env.NOVO_CLIENTE?.trim();

  if (!novoClienteListId) {
    dependencies.logger?.warn(
      "NOVO_CLIENTE is not configured; skipping webhook command registration.",
    );
    return {};
  }

  return {
    [novoClienteListId]:
      dependencies.novoClienteCommand ?? createPartnerCommissionTask,
  };
}

export function getAutomationSourceListId(payload: ClickUpWebhookPayload) {
  if (!isClickUpAutomationWebhookPayload(payload)) {
    return undefined;
  }

  return payload.payload.subcategory ?? payload.payload.lists?.[0]?.list_id;
}

export function createClickUpWebhookHandler(
  dependencies: ClickUpWebhookDependencies = {},
): ClickUpWebhookHandler {
  const logger = dependencies.logger ?? console;
  const commandsBySourceListId = buildCommandRegistry({
    ...dependencies,
    logger,
  });

  return async (payload) => {
    if (!isClickUpAutomationWebhookPayload(payload)) {
      return;
    }

    const sourceListId = getAutomationSourceListId(payload);

    if (!sourceListId) {
      logger.warn("ClickUp automation payload is missing a source list id.", {
        taskId: payload.payload.id,
        automationId: payload.auto_id,
      });
      return;
    }

    const command = commandsBySourceListId[sourceListId];

    if (!command) {
      return;
    }

    await command(payload);
  };
}

export const handleClickUpWebhook = createClickUpWebhookHandler();
