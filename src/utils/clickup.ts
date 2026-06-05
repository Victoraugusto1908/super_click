const DEFAULT_CLICKUP_API_BASE_URL = "https://api.clickup.com/api/v2";

export type ClickUpTask = {
  id: string;
  name?: string;
  [key: string]: unknown;
};

export type CreateClickUpTaskInput = {
  listId?: string;
  name: string;
  status?: string;
  customItemId?: number;
  description?: string;
  tags?: string[];
  startDate?: number;
  dueDate?: number;
  priority?: number | null;
  assignees?: number[];
};

export type SetClickUpCustomFieldValueInput = {
  taskId: string;
  fieldId: string;
  value: unknown;
  valueOptions?: Record<string, unknown>;
};

export type ClickUpClient = {
  createTask: (input: CreateClickUpTaskInput) => Promise<ClickUpTask>;
  setCustomFieldValue: (
    input: SetClickUpCustomFieldValueInput,
  ) => Promise<void>;
};

type CreateClickUpClientDependencies = {
  apiBaseUrl?: string;
  apiKey?: string;
  destinationListId?: string;
  fetch?: typeof fetch;
};

type JsonRecord = Record<string, unknown>;

export function createClickUpClient(
  dependencies: CreateClickUpClientDependencies = {},
): ClickUpClient {
  const apiBaseUrl =
    dependencies.apiBaseUrl?.replace(/\/$/, "") ?? DEFAULT_CLICKUP_API_BASE_URL;
  const apiKey = dependencies.apiKey ?? Bun.env.CLICKUP_API_KEY;
  const destinationListId =
    dependencies.destinationListId ?? Bun.env.DESTINY_LIST;
  const fetchFn = dependencies.fetch ?? fetch;

  if (!apiKey) {
    throw new Error("CLICKUP_API_KEY is not configured");
  }

  const resolvedApiKey = apiKey;

  async function request<TResponse>(
    path: string,
    init: RequestInit,
  ): Promise<TResponse> {
    const response = await fetchFn(`${apiBaseUrl}${path}`, {
      ...init,
      headers: buildClickUpHeaders(resolvedApiKey, init.headers),
    });

    if (!response.ok) {
      throw new Error(
        `ClickUp request failed (${response.status} ${response.statusText}): ${await response.text()}`,
      );
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  }

  return {
    async createTask(input) {
      console.log("Criando tarefa: ", input.name);
      const resolvedListId = input.listId ?? destinationListId;

      if (!resolvedListId) {
        throw new Error("DESTINY_LIST is not configured");
      }

      const body: JsonRecord = {
        name: input.name,
      };

      if (input.status) {
        body.status = input.status;
      }

      if (input.customItemId !== undefined) {
        body.custom_item_id = input.customItemId;
      }

      if (input.description !== undefined) {
        body.description = input.description;
      }

      if (input.tags && input.tags.length > 0) {
        body.tags = input.tags;
      }

      if (input.startDate !== undefined) {
        body.start_date = input.startDate;
      }

      if (input.dueDate !== undefined) {
        body.due_date = input.dueDate;
      }

      if (input.priority !== undefined) {
        body.priority = input.priority;
      }

      if (input.assignees && input.assignees.length > 0) {
        body.assignees = input.assignees;
      }

      const task = await request<ClickUpTask>(`/list/${resolvedListId}/task`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (typeof task.id !== "string") {
        throw new Error(
          "ClickUp createTask response did not include a task id",
        );
      }

      return task;
    },

    async setCustomFieldValue(input) {
      console.log("Setando campo personalizado: ", input.fieldId);
      const body: JsonRecord = {
        value: input.value,
      };

      if (input.valueOptions) {
        body.value_options = input.valueOptions;
      }

      await request(`/task/${input.taskId}/field/${input.fieldId}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  };
}

function buildClickUpHeaders(apiKey: string, headers?: RequestInit["headers"]) {
  const mergedHeaders = new Headers(headers);

  mergedHeaders.set("Authorization", apiKey);
  mergedHeaders.set("Content-Type", "application/json");
  mergedHeaders.set("accept", "application/json");

  return mergedHeaders;
}
