import { randomUUID } from "node:crypto";
import { prompts } from "./prompts.mjs";
import { schemas } from "./schemas.mjs";

const OPENAI_STAGE_TIMEOUT_MS = 120_000;

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) if (content.type === "output_text" && typeof content.text === "string") return content.text;
  }
  throw new Error("The model response did not contain structured output text.");
}

async function callStructured(stage, input, model, apiKey) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        { role: "developer", content: [{ type: "input_text", text: prompts[stage] }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] },
      ],
      text: { format: { type: "json_schema", name: `evidenceweaver_${stage}`, schema: schemas[stage], strict: true } },
    }),
    signal: AbortSignal.timeout(OPENAI_STAGE_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `OpenAI request failed (${response.status}).`);
    error.statusCode = response.status === 429 ? 429 : 502;
    throw error;
  }
  try { return JSON.parse(outputText(payload)); }
  catch { throw new Error(`The ${stage} stage returned invalid JSON. Evidence and prior findings were preserved.`); }
}

function enrichSources(rawSources, workspace) {
  return rawSources.map((reference) => {
    const source = workspace.evidence.find((item) => item.id === reference.evidenceSourceId);
    if (!source) throw new Error(`Model cited unknown evidence source ${reference.evidenceSourceId}.`);
    const startCharacter = source.rawText.indexOf(reference.excerpt);
    if (startCharacter < 0) throw new Error("A model citation was not found verbatim in its source. Proposed output was not saved.");
    return { ...reference, startCharacter, endCharacter: startCharacter + reference.excerpt.length };
  });
}

export async function createOpenAIExtraction(workspace, options) {
  const { apiKey, model } = options;
  const evidence = workspace.evidence.map(({ id, title, rawText }) => ({ evidenceSourceId: id, title, rawText }));
  const normalized = await callStructured("normalize", { evidence }, model, apiKey);
  const rawEntities = await callStructured("entities", { evidence, normalizedMessages: normalized.messages }, model, apiKey);
  const caseId = workspace.case.id;
  const entities = rawEntities.entities.map((item) => ({
    ...item, id: `ent-${randomUUID()}`, caseId, description: item.description ?? undefined,
    reviewStatus: "unreviewed", sources: enrichSources(item.sources, workspace),
  }));
  const byValue = new Map(entities.map((item) => [item.normalizedValue.toLowerCase(), item.id]));
  const structuredEntities = entities.map(({ id, type, normalizedValue, displayedValue, description }) => ({ id, type, normalizedValue, displayedValue, description }));
  const rawEvents = await callStructured("events", { evidence, normalizedMessages: normalized.messages, entities: structuredEntities }, model, apiKey);
  const warnings = [];
  const events = rawEvents.events.map((item, index) => {
    const entityIds = item.entityValues.map((value) => byValue.get(value.toLowerCase())).filter(Boolean);
    if (entityIds.length !== item.entityValues.length) warnings.push(`Event ${index + 1} contained an unmatched entity value.`);
    const { entityValues: _entityValues, ...rest } = item;
    return {
      ...rest, id: `evt-${randomUUID()}`, caseId, entityIds, reviewStatus: "unreviewed",
      dateTime: item.dateTime ?? undefined, approximateDate: item.approximateDate ?? undefined,
      amount: item.amount ?? undefined, currency: item.currency ?? undefined, sources: enrichSources(item.sources, workspace),
    };
  });
  const [rawRelationships, rawIndicators, rawCoercion] = await Promise.all([
    callStructured("relationships", { evidence, entities: structuredEntities, events }, model, apiKey),
    callStructured("indicators", { entities: structuredEntities, events }, model, apiKey),
    callStructured("coercion", { evidence, normalizedMessages: normalized.messages, entities: structuredEntities }, model, apiKey),
  ]);
  const relationships = rawRelationships.relationships.flatMap((item, index) => {
    const sourceEntityId = byValue.get(item.sourceValue.toLowerCase());
    const targetEntityId = byValue.get(item.targetValue.toLowerCase());
    if (!sourceEntityId || !targetEntityId) {
      warnings.push(`Relationship ${index + 1} was omitted because an endpoint did not match an extracted entity.`);
      return [];
    }
    const { sourceValue: _source, targetValue: _target, ...rest } = item;
    return [{ ...rest, id: `rel-${randomUUID()}`, caseId, sourceEntityId, targetEntityId, description: item.description ?? undefined, sources: enrichSources(item.sources, workspace) }];
  });
  const indicators = rawIndicators.indicators.map((item) => {
    const { supportingEntityValues, supportingEventIndexes, ...rest } = item;
    return {
      ...rest, id: `ind-${randomUUID()}`, caseId, reviewStatus: "unreviewed",
      supportingEntityIds: supportingEntityValues.map((value) => byValue.get(value.toLowerCase())).filter(Boolean),
      supportingEventIds: supportingEventIndexes.map((index) => events[index]?.id).filter(Boolean),
      sources: enrichSources(item.sources, workspace),
    };
  });
  const coercionSignals = rawCoercion.coercionSignals.map((item) => {
    const { relatedEntityValues, ...rest } = item;
    return {
      ...rest, id: `coer-${randomUUID()}`, caseId, reviewStatus: "unreviewed",
      speaker: item.speaker ?? undefined, dateTime: item.dateTime ?? undefined,
      relatedEntityIds: relatedEntityValues.map((value) => byValue.get(value.toLowerCase())).filter(Boolean),
      sources: enrichSources(item.sources, workspace),
    };
  });
  return { entities, events, relationships, indicators, coercionSignals, warnings };
}
