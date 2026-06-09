const DEFAULT_CLICKUP_API_BASE_URL = "https://api.clickup.com/api/v2";

export type ClickUpTask = {
  id: string;
  name?: string;
  date_created?: string | number | null;
  tags?: unknown[];
  custom_fields?: ClickUpTaskCustomField[];
  linked_tasks?: ClickUpTaskLink[];
  list?: {
    id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type ClickUpTaskLink = {
  task_id: string;
  link_id?: string;
  [key: string]: unknown;
};

export type ClickUpTaskCustomFieldOption = {
  id?: string;
  [key: string]: unknown;
};

export type ClickUpTaskCustomField = {
  id: string;
  value?: unknown;
  type_config?: {
    options?: ClickUpTaskCustomFieldOption[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type ClickUpListTasksResponse = {
  tasks: ClickUpTask[];
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

export type CreateClickUpTaskCommentInput = {
  taskId: string;
  commentText: string;
  notifyAll: boolean;
};

export type ClickUpClient = {
  createTask: (input: CreateClickUpTaskInput) => Promise<ClickUpTask>;
  getTask: (taskId: string) => Promise<ClickUpTask>;
  getAllTasksFromList: (listId: string) => Promise<ClickUpTask[]>;
  createTaskComment: (input: CreateClickUpTaskCommentInput) => Promise<void>;
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

    async getTask(taskId) {
      return request<ClickUpTask>(`/task/${taskId}`, {
        method: "GET",
      });
    },

    async getAllTasksFromList(listId) {
      const tasks: ClickUpTask[] = [];
      let page = 0;

      while (true) {
        const response = await request<ClickUpListTasksResponse>(
          `/list/${listId}/task?page=${page}`,
          {
            method: "GET",
          },
        );

        if (!Array.isArray(response.tasks)) {
          throw new Error(
            "ClickUp list tasks response did not include a tasks array",
          );
        }

        tasks.push(...response.tasks);

        if (response.tasks.length === 0) {
          return tasks;
        }

        page += 1;
      }
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

    async createTaskComment(input) {
      await request(`/task/${input.taskId}/comment`, {
        method: "POST",
        body: JSON.stringify({
          comment_text: input.commentText,
          notify_all: input.notifyAll,
        }),
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
