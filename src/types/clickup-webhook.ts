export type ClickUpApiWebhookPayload = {
  event: string;
  webhook_id: string;
  [key: string]: unknown;
};

export type ClickUpAutomationWebhookPayload = {
  auto_id: string;
  trigger_id: string;
  date: string;
  payload: Record<string, unknown>;
  [key: string]: unknown;
};

export type ClickUpWebhookPayload =
  | ClickUpApiWebhookPayload
  | ClickUpAutomationWebhookPayload;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isClickUpApiWebhookPayload(
  value: unknown,
): value is ClickUpApiWebhookPayload {
  return (
    isRecord(value) &&
    typeof value.event === "string" &&
    typeof value.webhook_id === "string"
  );
}

export function isClickUpAutomationWebhookPayload(
  value: unknown,
): value is ClickUpAutomationWebhookPayload {
  return (
    isRecord(value) &&
    typeof value.auto_id === "string" &&
    typeof value.trigger_id === "string" &&
    typeof value.date === "string" &&
    isRecord(value.payload)
  );
}

export function isClickUpWebhookPayload(
  value: unknown,
): value is ClickUpWebhookPayload {
  return (
    isClickUpApiWebhookPayload(value) ||
    isClickUpAutomationWebhookPayload(value)
  );
}
