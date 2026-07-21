const findingCollections = ["entities", "events", "relationships", "indicators", "coercionSignals"];

export function validateExtraction(workspace, proposed) {
  const errors = [];
  const sources = new Map(workspace.evidence.map((source) => [source.id, source]));
  const findingIds = new Set();

  for (const collection of findingCollections) {
    if (!Array.isArray(proposed[collection])) {
      errors.push(`${collection} must be an array`);
      continue;
    }
    for (const item of proposed[collection]) {
      if (!item.id || !item.caseId) errors.push(`${collection} item is missing an id or caseId`);
      if (item.caseId && item.caseId !== workspace.case.id) errors.push(`${collection}/${item.id ?? "unknown"} belongs to a different case`);
      if (item.id && findingIds.has(item.id)) errors.push(`${collection}/${item.id} has a duplicate finding id`);
      if (item.id) findingIds.add(item.id);
      if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
        errors.push(`${collection}/${item.id ?? "unknown"} has invalid confidence`);
      }
      const unsupportedStage = collection === "indicators" && item.observed === false;
      if (!Array.isArray(item.sources) || (!unsupportedStage && item.sources.length === 0)) {
        errors.push(`${collection}/${item.id ?? "unknown"} has no source reference`);
        continue;
      }
      for (const reference of item.sources) {
        const source = sources.get(reference.evidenceSourceId);
        if (!source) {
          errors.push(`${collection}/${item.id} cites an unknown evidence source`);
          continue;
        }
        if (!reference.excerpt || !source.rawText.includes(reference.excerpt)) {
          errors.push(`${collection}/${item.id} contains an excerpt not found verbatim in its source`);
          continue;
        }
        const start = source.rawText.indexOf(reference.excerpt);
        if (reference.startCharacter !== start || reference.endCharacter !== start + reference.excerpt.length) {
          errors.push(`${collection}/${item.id} has an incorrect character range`);
        }
      }
    }
  }

  const entities = Array.isArray(proposed.entities) ? proposed.entities : [];
  const events = Array.isArray(proposed.events) ? proposed.events : [];
  const relationships = Array.isArray(proposed.relationships) ? proposed.relationships : [];
  const indicators = Array.isArray(proposed.indicators) ? proposed.indicators : [];
  const coercionSignals = Array.isArray(proposed.coercionSignals) ? proposed.coercionSignals : [];
  const entityIds = new Set(entities.map((entity) => entity.id));
  const eventIds = new Set(events.map((event) => event.id));
  for (const event of events) {
    for (const id of event.entityIds ?? []) if (!entityIds.has(id)) errors.push(`event/${event.id} references unknown entity ${id}`);
  }
  for (const edge of relationships) {
    if (!entityIds.has(edge.sourceEntityId) || !entityIds.has(edge.targetEntityId)) {
      errors.push(`relationship/${edge.id} references an unknown entity`);
    }
  }
  for (const indicator of indicators) {
    for (const id of indicator.supportingEntityIds ?? []) if (!entityIds.has(id)) errors.push(`indicator/${indicator.id} references unknown entity ${id}`);
    for (const id of indicator.supportingEventIds ?? []) if (!eventIds.has(id)) errors.push(`indicator/${indicator.id} references unknown event ${id}`);
  }
  for (const signal of coercionSignals) {
    for (const id of signal.relatedEntityIds ?? []) if (!entityIds.has(id)) errors.push(`coercionSignal/${signal.id} references unknown entity ${id}`);
  }
  return errors;
}

export function assertValidExtraction(workspace, proposed) {
  const errors = validateExtraction(workspace, proposed);
  if (errors.length) {
    const error = new Error(`Extraction failed integrity validation: ${errors.join("; ")}`);
    error.details = errors;
    throw error;
  }
}
