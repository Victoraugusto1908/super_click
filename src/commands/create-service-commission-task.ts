import {
  createPartnerCommissionTasksFromSource,
  type PartnerCommissionTaskExecutionDependencies,
} from "./create-partner-commission-task";
import {
  normalizeClickUpTask,
} from "./partner-commission-task-shared";
import type {
  ClickUpTaskUpdatedWebhookHistoryItem,
  ClickUpTaskUpdatedWebhookPayload,
} from "../types/clickup-webhook";
import {
  createClickUpClient,
  type ClickUpClient,
} from "../utils/clickup";

type ConsoleLike = Pick<Console, "log">;

type CreateServiceCommissionTaskDependencies =
  PartnerCommissionTaskExecutionDependencies & {
    clickUpClient?: ClickUpClient;
    logger?: ConsoleLike;
    novoClienteListId?: string;
  };

export type ClickUpTaskUpdatedServiceWebhookCommand = (
  payload: ClickUpTaskUpdatedWebhookPayload,
  triggeredServiceTags: readonly string[],
) => Promise<void>;

type ClickUpTagReference = {
  name?: string;
  [key: string]: unknown;
};

function isClickUpTagReference(value: unknown): value is ClickUpTagReference {
  return typeof value === "object" && value !== null;
}

function normalizeTagHistoryValue(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalizedTags: string[] = [];
  const seenTags = new Set<string>();

  for (const entry of value) {
    const tagName =
      typeof entry === "string"
        ? entry
        : isClickUpTagReference(entry) && typeof entry.name === "string"
          ? entry.name
          : undefined;

    if (!tagName || seenTags.has(tagName)) {
      continue;
    }

    normalizedTags.push(tagName);
    seenTags.add(tagName);
  }

  return normalizedTags;
}

export function extractAddedTagNamesFromHistoryItem(
  historyItem: ClickUpTaskUpdatedWebhookHistoryItem,
) {
  if (historyItem.field !== "tag") {
    return [];
  }

  const beforeTags = normalizeTagHistoryValue(historyItem.before);
  const afterTags = normalizeTagHistoryValue(historyItem.after);

  if (beforeTags === undefined || afterTags === undefined) {
    return undefined;
  }

  const beforeTagSet = new Set(beforeTags);
  const addedTags: string[] = [];

  for (const afterTag of afterTags) {
    if (beforeTagSet.has(afterTag)) {
      continue;
    }

    addedTags.push(afterTag);
  }

  return addedTags;
}

export function extractAddedTagNamesFromTaskUpdatedPayload(
  payload: ClickUpTaskUpdatedWebhookPayload,
) {
  const addedTags: string[] = [];
  const seenTags = new Set<string>();
  let sawTagHistoryItem = false;

  for (const historyItem of payload.history_items) {
    if (historyItem.field !== "tag") {
      continue;
    }

    sawTagHistoryItem = true;
    const addedTagsFromHistoryItem =
      extractAddedTagNamesFromHistoryItem(historyItem);

    if (addedTagsFromHistoryItem === undefined) {
      return undefined;
    }

    for (const tag of addedTagsFromHistoryItem) {
      if (seenTags.has(tag)) {
        continue;
      }

      addedTags.push(tag);
      seenTags.add(tag);
    }
  }

  return sawTagHistoryItem ? addedTags : [];
}

export function createServiceCommissionTaskCommand(
  dependencies: CreateServiceCommissionTaskDependencies = {},
): ClickUpTaskUpdatedServiceWebhookCommand {
  return async (payload, triggeredServiceTags) => {
    if (triggeredServiceTags.length === 0) {
      return;
    }

    const clickUpClient = dependencies.clickUpClient ?? createClickUpClient();
    const logger = dependencies.logger ?? console;
    const novoClienteListId =
      dependencies.novoClienteListId ?? Bun.env.NOVO_CLIENTE?.trim();

    if (!novoClienteListId) {
      throw new Error("NOVO_CLIENTE is not configured");
    }

    const sourceTask = await clickUpClient.getTask(payload.task_id);

    if (sourceTask.list?.id !== novoClienteListId) {
      logger.log(
        "Ignoring service commission webhook for task outside configured NOVO_CLIENTE list.",
        {
          taskId: sourceTask.id,
          taskListId: sourceTask.list?.id,
          novoClienteListId,
        },
      );
      return;
    }

    await createPartnerCommissionTasksFromSource(
      normalizeClickUpTask(sourceTask),
      triggeredServiceTags,
      {
        ...dependencies,
        clickUpClient,
        logger,
      },
    );
  };
}

export const createServiceCommissionTask =
  createServiceCommissionTaskCommand();
