const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
const source = {
  type: "object", additionalProperties: false,
  required: ["evidenceSourceId", "messageIndex", "excerpt"],
  properties: { evidenceSourceId: { type: "string" }, messageIndex: { type: "integer" }, excerpt: { type: "string" } },
};
const wrapper = (key, item) => ({ type: "object", additionalProperties: false, required: [key], properties: { [key]: { type: "array", items: item } } });

export const schemas = {
  normalize: wrapper("messages", {
    type: "object", additionalProperties: false, required: ["messageIndex", "speaker", "timestamp", "text", "originalExcerpt"],
    properties: { messageIndex: { type: "integer" }, speaker: nullableString, timestamp: nullableString, text: { type: "string" }, originalExcerpt: { type: "string" } },
  }),
  entities: wrapper("entities", {
    type: "object", additionalProperties: false, required: ["type", "displayedValue", "normalizedValue", "description", "confidence", "sources"],
    properties: {
      type: { type: "string", enum: ["person", "alias", "organization", "phone", "email", "social_account", "messaging_account", "crypto_wallet", "bank_account", "crypto_exchange", "website", "domain", "ip_address", "physical_location", "company", "currency", "other"] },
      displayedValue: { type: "string" }, normalizedValue: { type: "string" }, description: nullableString,
      confidence: { type: "number", minimum: 0, maximum: 1 }, sources: { type: "array", minItems: 1, items: source },
    },
  }),
  events: wrapper("events", {
    type: "object", additionalProperties: false, required: ["eventType", "dateTime", "approximateDate", "description", "entityValues", "amount", "currency", "confidence", "sources"],
    properties: {
      eventType: { type: "string", enum: ["initial_contact", "platform_change", "relationship_development", "investment_introduction", "account_creation", "money_request", "transfer", "reported_profit", "withdrawal_attempt", "withdrawal_blocked", "fee_demand", "threat", "communication", "other"] },
      dateTime: nullableString, approximateDate: nullableString, description: { type: "string" }, entityValues: { type: "array", items: { type: "string" } },
      amount: nullableNumber, currency: nullableString, confidence: { type: "number", minimum: 0, maximum: 1 }, sources: { type: "array", minItems: 1, items: source },
    },
  }),
  relationships: wrapper("relationships", {
    type: "object", additionalProperties: false, required: ["sourceValue", "targetValue", "relationshipType", "description", "confidence", "sources"],
    properties: {
      sourceValue: { type: "string" }, targetValue: { type: "string" }, relationshipType: { type: "string", enum: ["communicated_with", "used_alias", "controlled_account", "sent_funds_to", "received_funds_from", "associated_with", "directed_to", "mentioned", "unknown"] },
      description: nullableString, confidence: { type: "number", minimum: 0, maximum: 1 }, sources: { type: "array", minItems: 1, items: source },
    },
  }),
  indicators: wrapper("indicators", {
    type: "object", additionalProperties: false, required: ["category", "label", "explanation", "confidence", "severity", "supportingEntityValues", "supportingEventIndexes", "sources", "alternativeExplanation", "missingEvidence", "observed", "stageNumber"],
    properties: {
      category: { type: "string" }, label: { type: "string" }, explanation: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, severity: { type: "string", enum: ["low", "moderate", "high"] },
      supportingEntityValues: { type: "array", items: { type: "string" } }, supportingEventIndexes: { type: "array", items: { type: "integer" } }, sources: { type: "array", items: source },
      alternativeExplanation: { type: "string" }, missingEvidence: { type: "string" }, observed: { type: "boolean" }, stageNumber: { type: "integer", minimum: 1, maximum: 12 },
    },
  }),
  coercion: wrapper("coercionSignals", {
    type: "object", additionalProperties: false,
    required: ["category", "label", "explanation", "speaker", "dateTime", "confidence", "alternativeExplanation", "reviewPriority", "relatedEntityValues", "sources"],
    properties: {
      category: { type: "string", enum: ["restricted_movement", "confiscated_documents", "debt_or_recruitment_fees", "threats_of_violence", "work_quotas", "punishment", "guarded_compound", "communication_surveillance", "request_for_rescue", "unable_to_leave", "forced_participation", "withheld_pay", "false_employment", "cross_border_transport", "location_secrecy", "other"] },
      label: { type: "string" }, explanation: { type: "string" }, speaker: nullableString, dateTime: nullableString,
      confidence: { type: "number", minimum: 0, maximum: 1 }, alternativeExplanation: { type: "string" },
      reviewPriority: { type: "string", enum: ["routine", "elevated", "urgent"] }, relatedEntityValues: { type: "array", items: { type: "string" } },
      sources: { type: "array", minItems: 1, items: source },
    },
  }),
};

schemas.indicators.properties.indicators.minItems = 12;
schemas.indicators.properties.indicators.maxItems = 12;
