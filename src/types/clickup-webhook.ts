export type ClickUpApiWebhookPayload = {
  event: string;
  webhook_id: string;
  [key: string]: unknown;
};

export type ClickUpTaskUpdatedWebhookCustomField = {
  id: string;
  [key: string]: unknown;
};

export type ClickUpTaskUpdatedWebhookHistoryItem = {
  field: string;
  before?: unknown;
  after?: unknown;
  custom_field?: ClickUpTaskUpdatedWebhookCustomField;
  [key: string]: unknown;
};

export type ClickUpTaskUpdatedWebhookPayload = ClickUpApiWebhookPayload & {
  task_id: string;
  history_items: ClickUpTaskUpdatedWebhookHistoryItem[];
};

export type ClickUpAutomationWebhookField = {
  field_id: string;
  value?: unknown;
  value_options?: Record<string, unknown> | null;
  value_deleted?: boolean;
  type?: number;
  [key: string]: unknown;
};

export type ClickUpAutomationWebhookListReference = {
  list_id: string;
  type?: string;
  [key: string]: unknown;
};

export type ClickUpAutomationWebhookRelatedTask = {
  task_id: string;
  type?: string;
  [key: string]: unknown;
};

export type ClickUpAutomationTaskTimeMgmt = {
  date_created?: string | number | null;
  [key: string]: unknown;
};

export type ClickUpAutomationTaskPayload = {
  id: string;
  name: string;
  subcategory?: string | null;
  lists?: ClickUpAutomationWebhookListReference[];
  related_tasks?: ClickUpAutomationWebhookRelatedTask[];
  fields?: ClickUpAutomationWebhookField[];
  tags?: string[];
  time_mgmt?: ClickUpAutomationTaskTimeMgmt;
  [key: string]: unknown;
};

export type ClickUpAutomationWebhookPayload = {
  auto_id: string;
  trigger_id: string;
  date: string;
  payload: ClickUpAutomationTaskPayload;
  [key: string]: unknown;
};

export type ClickUpWebhookPayload =
  | ClickUpTaskUpdatedWebhookPayload
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
    isClickUpAutomationTaskPayload(value.payload)
  );
}

export function isClickUpTaskUpdatedWebhookPayload(
  value: unknown,
): value is ClickUpTaskUpdatedWebhookPayload {
  return (
    isClickUpApiWebhookPayload(value) &&
    value.event === "taskUpdated" &&
    typeof value.task_id === "string" &&
    Array.isArray(value.history_items) &&
    value.history_items.every(isClickUpTaskUpdatedWebhookHistoryItem)
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

export function isClickUpAutomationTaskPayload(
  value: unknown,
): value is ClickUpAutomationTaskPayload {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.subcategory === undefined ||
      value.subcategory === null ||
      typeof value.subcategory === "string") &&
    (value.lists === undefined ||
      (Array.isArray(value.lists) &&
        value.lists.every(isClickUpAutomationWebhookListReference))) &&
    (value.related_tasks === undefined ||
      (Array.isArray(value.related_tasks) &&
        value.related_tasks.every(isClickUpAutomationWebhookRelatedTask))) &&
    (value.time_mgmt === undefined ||
      value.time_mgmt === null ||
      isClickUpAutomationTaskTimeMgmt(value.time_mgmt)) &&
    (value.tags === undefined ||
      (Array.isArray(value.tags) &&
        value.tags.every((tag) => typeof tag === "string"))) &&
    (value.fields === undefined ||
      (Array.isArray(value.fields) &&
        value.fields.every(isClickUpAutomationWebhookField)))
  );
}

export function isClickUpAutomationWebhookField(
  value: unknown,
): value is ClickUpAutomationWebhookField {
  return (
    isRecord(value) &&
    typeof value.field_id === "string" &&
    (value.value_options === undefined ||
      value.value_options === null ||
      isRecord(value.value_options)) &&
    (value.value_deleted === undefined || typeof value.value_deleted === "boolean") &&
    (value.type === undefined || typeof value.type === "number")
  );
}

export function isClickUpTaskUpdatedWebhookHistoryItem(
  value: unknown,
): value is ClickUpTaskUpdatedWebhookHistoryItem {
  return (
    isRecord(value) &&
    typeof value.field === "string" &&
    (value.custom_field === undefined ||
      isClickUpTaskUpdatedWebhookCustomField(value.custom_field))
  );
}

export function isClickUpTaskUpdatedWebhookCustomField(
  value: unknown,
): value is ClickUpTaskUpdatedWebhookCustomField {
  return isRecord(value) && typeof value.id === "string";
}

export function isClickUpAutomationWebhookListReference(
  value: unknown,
): value is ClickUpAutomationWebhookListReference {
  return (
    isRecord(value) &&
    typeof value.list_id === "string" &&
    (value.type === undefined || typeof value.type === "string")
  );
}

export function isClickUpAutomationWebhookRelatedTask(
  value: unknown,
): value is ClickUpAutomationWebhookRelatedTask {
  return (
    isRecord(value) &&
    typeof value.task_id === "string" &&
    (value.type === undefined || typeof value.type === "string")
  );
}

export function isClickUpAutomationTaskTimeMgmt(
  value: unknown,
): value is ClickUpAutomationTaskTimeMgmt {
  return (
    isRecord(value) &&
    (value.date_created === undefined ||
      value.date_created === null ||
      typeof value.date_created === "string" ||
      typeof value.date_created === "number")
  );
}
