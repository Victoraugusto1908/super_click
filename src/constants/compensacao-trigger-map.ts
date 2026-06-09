import type { ClickUpTaskUpdatedWebhookHistoryItem } from "../types/clickup-webhook";

export type CompensacaoTriggerConfig = {
  valueFieldId: string;
  actionFieldId: string;
  boletoPedidoOptionId: string;
};

export const COMPENSACAO_TRIGGER_FIELDS: readonly CompensacaoTriggerConfig[] = [
  {
    valueFieldId: "dfaa24a8-0c61-4461-9e69-8aa2c74bc0f9",
    actionFieldId: "acfca708-e282-427d-86d5-b15449cce929",
    boletoPedidoOptionId: "81601c1e-59ee-4ecd-a349-542559b39a2d",
  },
  {
    valueFieldId: "eb3c7e2a-9dc7-48ea-8bc0-b125292d58e0",
    actionFieldId: "e0d357af-f0f2-47fa-9f4d-15600b665ac6",
    boletoPedidoOptionId: "4fd7adb1-532c-4b53-9e5a-12bd493318ab",
  },
  {
    valueFieldId: "7862f517-7be8-4ae2-9bd2-163707bd4901",
    actionFieldId: "ed410afb-a5b1-4f3a-963b-13a1b88aed56",
    boletoPedidoOptionId: "7dff25ef-0495-4e32-95b4-555a06e8e0e7",
  },
  {
    valueFieldId: "45128f22-7712-4fd1-8ee9-fb6fb6ffa08e",
    actionFieldId: "af361038-0079-4975-8de0-a8dbe409be76",
    boletoPedidoOptionId: "c2b7e40d-516b-4986-be35-3fcef5f99cef",
  },
  {
    valueFieldId: "148c8ba0-add6-46e7-ba51-dc774defeea3",
    actionFieldId: "00bce09c-c324-4893-9667-50fa3b67a7f4",
    boletoPedidoOptionId: "04b74b94-6d15-4481-9fe8-5ab4b7eed42d",
  },
  {
    valueFieldId: "f49e628a-d918-473d-88d1-025997313e6b",
    actionFieldId: "b9a4806c-6fa2-49df-aa79-dad9014147d2",
    boletoPedidoOptionId: "086383f9-570b-4dc2-8654-c05748379260",
  },
] as const;

const COMPENSACAO_TRIGGER_BY_ACTION_FIELD_ID = new Map(
  COMPENSACAO_TRIGGER_FIELDS.map((field) => [field.actionFieldId, field]),
);

export function getCompensacaoTriggerByActionFieldId(fieldId: string) {
  return COMPENSACAO_TRIGGER_BY_ACTION_FIELD_ID.get(fieldId);
}

export function isCompensacaoActionField(fieldId: string) {
  return COMPENSACAO_TRIGGER_BY_ACTION_FIELD_ID.has(fieldId);
}

export function isCompensacaoBoletoPedido(
  fieldId: string,
  optionId: unknown,
) {
  const trigger = getCompensacaoTriggerByActionFieldId(fieldId);

  return (
    typeof optionId === "string" &&
    trigger?.boletoPedidoOptionId === optionId
  );
}

export function findTriggeredCompensacaoField(
  historyItems: readonly ClickUpTaskUpdatedWebhookHistoryItem[] | undefined,
) {
  return historyItems?.find((historyItem) => {
    if (historyItem.field !== "custom_field") {
      return false;
    }

    const fieldId = historyItem.custom_field?.id;

    if (typeof fieldId !== "string" || !isCompensacaoActionField(fieldId)) {
      return false;
    }

    return isCompensacaoBoletoPedido(fieldId, historyItem.after);
  });
}
