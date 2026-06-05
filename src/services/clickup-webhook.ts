import {
  isClickUpApiWebhookPayload,
  type ClickUpWebhookPayload,
} from "../types/clickup-webhook";

const DEFAULT_RELEVANT_EVENTS: readonly string[] = [];

export type ClickUpWebhookHandler = (
  payload: ClickUpWebhookPayload,
) => Promise<void>;

type ClickUpWebhookDependencies = {
  performClickUpFollowUpAction?: ClickUpWebhookHandler;
  relevantEvents?: readonly string[];
};

export async function performClickUpFollowUpAction(
  _payload: ClickUpWebhookPayload,
): Promise<void> {
  // Placeholder for the future ClickUp follow-up action.
}

export function shouldHandleClickUpEvent(
  payload: ClickUpWebhookPayload,
  relevantEvents: readonly string[] = DEFAULT_RELEVANT_EVENTS,
) {
  return (
    isClickUpApiWebhookPayload(payload) &&
    relevantEvents.includes(payload.event)
  );
}

export function createClickUpWebhookHandler(
  dependencies: ClickUpWebhookDependencies = {},
): ClickUpWebhookHandler {
  const performAction =
    dependencies.performClickUpFollowUpAction ?? performClickUpFollowUpAction;
  const relevantEvents = dependencies.relevantEvents ?? DEFAULT_RELEVANT_EVENTS;

  return async (payload) => {
    if (!shouldHandleClickUpEvent(payload, relevantEvents)) {
      return;
    }

    await performAction(payload);
  };
}

export const handleClickUpWebhook = createClickUpWebhookHandler();
