import { createHash } from "node:crypto";

const exactTypes = new Set(["crypto_wallet", "phone", "email", "social_account", "messaging_account", "domain", "website", "company", "bank_account"]);
const infrastructureTypes = new Set(["crypto_wallet", "domain", "website", "bank_account"]);

function stableId(parts) { return `match-${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 20)}`; }
function usable(items) { return (items ?? []).filter((item) => item.reviewStatus !== "rejected"); }

function lineReference(source, line) {
  const startCharacter = source.rawText.indexOf(line);
  return { evidenceSourceId: source.id, startCharacter, endCharacter: startCharacter + line.length, messageIndex: source.rawText.slice(0, startCharacter).split("\n").length, excerpt: line };
}

function phraseReference(workspace, phrase) {
  for (const source of workspace.evidence) {
    const line = source.rawText.split("\n").find((candidate) => candidate.toLowerCase().includes(phrase));
    if (line) return lineReference(source, line);
  }
  return null;
}

function reviewed(match, reviews) { return { ...match, reviewStatus: reviews?.[match.id] ?? "unreviewed" }; }

export function computeCrossCaseMatches(store, caseId) {
  const current = store.cases.find((item) => item.case.id === caseId);
  if (!current) return [];
  const results = [];
  const currentEntities = usable(current.entities).filter((item) => exactTypes.has(item.type));
  const currentEvents = usable(current.events);
  const leftSequence = currentEvents.map((event) => event.eventType);
  for (const other of store.cases.filter((item) => item.case.id !== caseId)) {
    const otherEntities = usable(other.entities).filter((item) => exactTypes.has(item.type));
    const otherByValue = new Map();
    for (const item of otherEntities) {
      const key = `${item.type}:${item.normalizedValue}`;
      const matches = otherByValue.get(key) ?? [];
      matches.push(item);
      otherByValue.set(key, matches);
    }
    for (const left of currentEntities) {
      for (const right of otherByValue.get(`${left.type}:${left.normalizedValue}`) ?? []) {
        const matchType = infrastructureTypes.has(left.type) ? "shared_infrastructure" : "exact_entity";
        const id = stableId([current.case.id, other.case.id].sort().concat(matchType, left.type, left.normalizedValue));
        results.push(reviewed({
          id, caseIds: [current.case.id, other.case.id], relatedCaseId: other.case.id, relatedCaseTitle: other.case.title,
          matchType, description: `Exact ${left.type.replaceAll("_", " ")} match across both cases. This establishes a shared submitted value, not common ownership or identity.`,
          confidence: 1, matchedValues: [left.displayedValue], sourceReferences: [left.sources[0], right.sources[0]].filter(Boolean), exact: true,
        }, store.linkReviews));
      }
    }
    const phrases = ["verification reserve required", "account may remain frozen", "platform schedule is not controlled by me"];
    for (const phrase of phrases) {
      const leftRef = phraseReference(current, phrase); const rightRef = phraseReference(other, phrase);
      if (!leftRef || !rightRef) continue;
      const id = stableId([current.case.id, other.case.id].sort().concat("shared_script", phrase));
      results.push(reviewed({
        id, caseIds: [current.case.id, other.case.id], relatedCaseId: other.case.id, relatedCaseTitle: other.case.title,
        matchType: "shared_script", description: `Both submitted conversations contain the phrase “${phrase}”. Reused language may have benign or coordinated explanations and requires review.`,
        confidence: .86, matchedValues: [phrase], sourceReferences: [leftRef, rightRef], exact: false,
      }, store.linkReviews));
    }
    const otherEvents = usable(other.events);
    const rightSequence = otherEvents.map((event) => event.eventType);
    const common = [...new Set(leftSequence.filter((type) => rightSequence.includes(type)))];
    const union = [...new Set([...leftSequence, ...rightSequence])];
    const similarity = union.length ? common.length / union.length : 0;
    if (common.length >= 5 && similarity >= .55) {
      const id = stableId([current.case.id, other.case.id].sort().concat("behavioral_similarity", common.join(",")));
      const sources = [currentEvents[0]?.sources[0], otherEvents[0]?.sources[0]].filter(Boolean);
      results.push(reviewed({
        id, caseIds: [current.case.id, other.case.id], relatedCaseId: other.case.id, relatedCaseTitle: other.case.title,
        matchType: "behavioral_similarity", description: `The cases share ${common.length} event categories, including ${common.slice(0, 4).map((type) => type.replaceAll("_", " ")).join(", ")}. This is a sequence-level suggestion, not an attribution.`,
        confidence: Math.min(.82, .55 + similarity * .25), matchedValues: common, sourceReferences: sources, exact: false,
      }, store.linkReviews));
    }
  }
  const unique = new Map(results.map((item) => [item.id, item]));
  return [...unique.values()].sort((a, b) => Number(b.exact) - Number(a.exact) || b.confidence - a.confidence);
}
