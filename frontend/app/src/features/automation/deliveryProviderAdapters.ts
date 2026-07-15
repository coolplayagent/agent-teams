import type {
  AutomationDeliveryBinding,
  AutomationDeliveryBindingCandidate,
} from "../../api/contracts";

interface DeliveryProviderAdapter {
  bindingLabel: (binding: AutomationDeliveryBinding) => string;
  bindingValue: (binding: AutomationDeliveryBinding) => string;
  candidateLabel: (candidate: AutomationDeliveryBindingCandidate) => string;
  candidateValue: (candidate: AutomationDeliveryBindingCandidate) => string;
  toBinding: (candidate: AutomationDeliveryBindingCandidate) => AutomationDeliveryBinding;
}

const DELIVERY_PROVIDER_ADAPTERS: Readonly<Record<string, DeliveryProviderAdapter>> = {
  feishu: {
    bindingLabel: (binding) => `Feishu / ${"source_label" in binding ? binding.source_label : ""}`,
    bindingValue: (binding) =>
      `feishu::${"trigger_id" in binding ? binding.trigger_id : ""}::${"session_id" in binding ? binding.session_id ?? "" : ""}`,
    candidateLabel: (candidate) =>
      `Feishu / ${"source_label" in candidate ? candidate.source_label : ""}`,
    candidateValue: (candidate) =>
      `feishu::${"trigger_id" in candidate ? candidate.trigger_id : ""}::${"session_id" in candidate ? candidate.session_id : ""}`,
    toBinding: (candidate) => ({
      provider: "feishu",
      chat_id: "chat_id" in candidate ? candidate.chat_id : "",
      chat_type: "chat_type" in candidate ? candidate.chat_type : "",
      session_id: "session_id" in candidate ? candidate.session_id : null,
      source_label: candidate.source_label,
      tenant_key: "tenant_key" in candidate ? candidate.tenant_key : "",
      trigger_id: "trigger_id" in candidate ? candidate.trigger_id : "",
    }),
  },
  xiaoluban: {
    bindingLabel: (binding) =>
      `Xiaoluban / ${"display_name" in binding ? binding.display_name : ""}`,
    bindingValue: (binding) =>
      `xiaoluban::${"account_id" in binding ? binding.account_id : ""}`,
    candidateLabel: (candidate) =>
      `Xiaoluban / ${"display_name" in candidate ? candidate.display_name : ""}`,
    candidateValue: (candidate) =>
      `xiaoluban::${"account_id" in candidate ? candidate.account_id : ""}`,
    toBinding: (candidate) => ({
      provider: "xiaoluban",
      account_id: "account_id" in candidate ? candidate.account_id : "",
      derived_uid: "derived_uid" in candidate ? candidate.derived_uid : "",
      display_name: "display_name" in candidate ? candidate.display_name : "",
      source_label: candidate.source_label,
    }),
  },
};

export function deliveryProviderAdapter(provider: string): DeliveryProviderAdapter | null {
  return DELIVERY_PROVIDER_ADAPTERS[provider] ?? null;
}
