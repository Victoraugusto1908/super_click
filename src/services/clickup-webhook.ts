import {
  createPartnerCommissionTask,
  type ClickUpAutomationWebhookCommand,
} from "../commands/create-partner-commission-task";
import {
  createCompesacaoTask,
  type ClickUpTaskUpdatedWebhookCommand,
} from "../commands/create-compesacao-task";
import { linkPartnerRelationship } from "../commands/link-partner-relationship";
import { findTriggeredCompensacaoField } from "../constants/compensacao-trigger-map";
import {
  isClickUpAutomationWebhookPayload,
  isClickUpTaskUpdatedWebhookPayload,
  type ClickUpWebhookPayload,
} from "../types/clickup-webhook";

type ConsoleLike = Pick<Console, "warn">;

export type ClickUpWebhookHandler = (
  payload: ClickUpWebhookPayload,
) => Promise<void>;

type ClickUpWebhookDependencies = {
  commandsBySourceListId?: Record<string, ClickUpAutomationWebhookCommand>;
  compesacaoCommand?: ClickUpTaskUpdatedWebhookCommand;
  compesacaoListId?: string;
  logger?: ConsoleLike;
  novoClienteCommand?: ClickUpAutomationWebhookCommand;
  novoClienteListId?: string;
  novoParceiroCommand?: ClickUpAutomationWebhookCommand;
  novoParceiroListId?: string;
};

function buildAutomationCommandRegistry(
  dependencies: ClickUpWebhookDependencies,
): Record<string, ClickUpAutomationWebhookCommand> {
  if (dependencies.commandsBySourceListId) {
    return dependencies.commandsBySourceListId;
  }

  const registry: Record<string, ClickUpAutomationWebhookCommand> = {};
  const novoClienteListId =
    dependencies.novoClienteListId ?? Bun.env.NOVO_CLIENTE?.trim();
  const novoParceiroListId =
    dependencies.novoParceiroListId ?? Bun.env.NOVO_PARCEIRO?.trim();

  if (novoClienteListId) {
    registry[novoClienteListId] =
      dependencies.novoClienteCommand ?? createPartnerCommissionTask;
  } else {
    dependencies.logger?.warn(
      "NOVO_CLIENTE is not configured; skipping webhook command registration.",
    );
  }

  if (novoParceiroListId) {
    registry[novoParceiroListId] =
      dependencies.novoParceiroCommand ?? linkPartnerRelationship;
  } else {
    dependencies.logger?.warn(
      "NOVO_PARCEIRO is not configured; skipping webhook command registration.",
    );
  }

  return registry;
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
  const commandsBySourceListId = buildAutomationCommandRegistry({
    ...dependencies,
    logger,
  });
  const compesacaoListId =
    dependencies.compesacaoListId ?? Bun.env.COMPESACAO?.trim();
  const compesacaoCommand =
    dependencies.compesacaoCommand ?? createCompesacaoTask;

  if (!compesacaoListId) {
    logger.warn(
      "COMPESACAO is not configured; skipping webhook command registration.",
    );
  }

  return async (payload) => {
    if (isClickUpAutomationWebhookPayload(payload)) {
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
      return;
    }

    if (!isClickUpTaskUpdatedWebhookPayload(payload)) {
      return;
    }

    if (!compesacaoListId) {
      return;
    }

    if (!findTriggeredCompensacaoField(payload.history_items)) {
      return;
    }

    await compesacaoCommand(payload);
  };
}

export const handleClickUpWebhook = createClickUpWebhookHandler();
