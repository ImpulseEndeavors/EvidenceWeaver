import test from "node:test";
import assert from "node:assert/strict";
import { createMockExtraction } from "../server/mock.mjs";
import { computeCrossCaseMatches } from "../server/cross-case.mjs";
import { buildInvestigatorQuestions } from "../server/questions.mjs";
import { buildBrief } from "../server/brief.mjs";
import { validateExtraction } from "../server/validation.mjs";

const evidenceLines = [
  "[2026-04-11T13:00:00Z] Evan: I'm Evan. Wrong number; Hi, is this Daniel from the photography group?",
  "[2026-04-11T14:00:00Z] Maya: I'm Maya Chen. My nickname Lin. Do you use LumaChat? My handle is maya.orchid.",
  "[2026-04-12T13:00:00Z] Maya: Meeting sincere people helps. I want more time freedom.",
  "[2026-04-12T14:00:00Z] Maya: My manager jokes that nobody leaves before the daily quota is done.",
  "[2026-04-13T13:00:00Z] Maya: The training site is https://harbor-lantern.example and Harbor Lantern Markets.",
  "[2026-04-14T13:00:00Z] Maya: Use Northstar Exchange and 0xF1C7100A0000000000000000000000000000E001.",
  "[2026-04-15T13:00:00Z] Evan: I sent $250. It shows $287.50. The $50 arrived at Northstar.",
  "[2026-04-16T13:00:00Z] Evan: I sent $2,000 USDT and later sent another $2,000. I need to withdraw $5,000.",
  "[2026-04-17T13:00:00Z] Evan: Withdrawal status changed to blocked; verification reserve required.",
  "[2026-04-18T13:00:00Z] Maya: Support gave a second wallet bc1qsynthetic00000000000000000000000000demo and said pay within 24 hours.",
  "[2026-04-18T14:00:00Z] Maya: Please act quickly. They check our work chats during shifts.",
  "[2026-04-19T13:00:00Z] Maya: The site says Halcyon Beacon Digital LLC. Can you finish the tier by 3 PM?",
  "[2026-04-20T13:00:00Z] Evan: The website stopped loading.",
].join("\n");

function workspace() {
  return {
    case: { id: "case-test" },
    evidence: [{ id: "src-test", caseId: "case-test", rawText: evidenceLines }],
    entities: [], events: [], relationships: [], indicators: [],
  };
}

test("mock extraction keeps every finding linked to a verbatim source range", () => {
  const current = workspace();
  const proposed = createMockExtraction(current);
  assert.deepEqual(validateExtraction(current, proposed), []);
  assert.ok(proposed.entities.length >= 8);
  assert.ok(proposed.events.length >= 10);
  assert.ok(proposed.relationships.length >= 6);
  assert.equal(proposed.indicators.length, 12);
  assert.equal(proposed.indicators.filter((item) => !item.observed).length, 1);
  assert.equal(proposed.coercionSignals.length, 2);
});

test("integrity validation rejects invented excerpts", () => {
  const current = workspace();
  const proposed = createMockExtraction(current);
  proposed.entities[0].sources[0].excerpt = "This text was never submitted.";
  assert.ok(validateExtraction(current, proposed).some((error) => error.includes("not found verbatim")));
});

test("integrity validation rejects relationships with unknown endpoints", () => {
  const current = workspace();
  const proposed = createMockExtraction(current);
  proposed.relationships[0].targetEntityId = "ent-does-not-exist";
  assert.ok(validateExtraction(current, proposed).some((error) => error.includes("unknown entity")));
});

test("integrity validation rejects findings assigned to another case", () => {
  const current = workspace();
  const proposed = createMockExtraction(current);
  proposed.events[0].caseId = "case-other";
  assert.ok(validateExtraction(current, proposed).some((error) => error.includes("different case")));
});

test("integrity validation rejects indicator references to unknown findings", () => {
  const current = workspace();
  const proposed = createMockExtraction(current);
  proposed.indicators[0].supportingEventIds = ["evt-does-not-exist"];
  proposed.indicators[0].supportingEntityIds = ["ent-does-not-exist"];
  const errors = validateExtraction(current, proposed);
  assert.ok(errors.some((error) => error.includes("unknown event")));
  assert.ok(errors.some((error) => error.includes("unknown entity")));
});

test("cross-case matching distinguishes exact infrastructure from suggestions", () => {
  const source = (id, text) => ({ evidenceSourceId: id, startCharacter: 0, endCharacter: text.length, messageIndex: 1, excerpt: text });
  const caseA = { case: { id: "a", title: "A" }, evidence: [{ id: "sa", rawText: "verification reserve required before release" }], entities: [{ id: "wa", type: "crypto_wallet", normalizedValue: "wallet-demo", displayedValue: "WALLET-DEMO", reviewStatus: "confirmed", sources: [source("sa", "verification reserve required before release")] }], events: ["initial_contact", "investment_introduction", "transfer", "withdrawal_attempt", "fee_demand"].map((eventType, index) => ({ id: `a${index}`, eventType, reviewStatus: "confirmed", sources: [source("sa", "verification reserve required before release")] })) };
  const caseB = { case: { id: "b", title: "B" }, evidence: [{ id: "sb", rawText: "verification reserve required before release" }], entities: [{ id: "wb", type: "crypto_wallet", normalizedValue: "wallet-demo", displayedValue: "WALLET-DEMO", reviewStatus: "unreviewed", sources: [source("sb", "verification reserve required before release")] }], events: ["initial_contact", "investment_introduction", "transfer", "withdrawal_attempt", "fee_demand"].map((eventType, index) => ({ id: `b${index}`, eventType, reviewStatus: "unreviewed", sources: [source("sb", "verification reserve required before release")] })) };
  const matches = computeCrossCaseMatches({ cases: [caseA, caseB], linkReviews: {} }, "a");
  assert.ok(matches.some((item) => item.exact && item.matchType === "shared_infrastructure"));
  assert.ok(matches.some((item) => !item.exact && item.matchType === "shared_script"));
  assert.ok(matches.some((item) => !item.exact && item.matchType === "behavioral_similarity"));
});

test("question generator keeps every proposed question tied to source evidence", () => {
  const current = workspace();
  const proposed = createMockExtraction(current);
  Object.assign(current, proposed);
  const questions = buildInvestigatorQuestions(current);
  assert.ok(questions.length >= 5);
  assert.ok(questions.every((item) => item.sources.length > 0 && item.question && item.informationNeeded));
});

test("brief language stays case-neutral and citation markers remain valid", () => {
  const current = workspace();
  Object.assign(current, createMockExtraction(current));
  current.questions = buildInvestigatorQuestions(current);
  const brief = buildBrief(current);
  assert.doesNotMatch(brief.sections[0].paragraphs.join(" "), /relationship-investment scam scenario/i);
  for (const section of brief.sections) {
    const markers = section.paragraphs.flatMap((paragraph) => [...paragraph.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));
    assert.ok(markers.every((marker) => marker >= 1 && marker <= section.citations.length), `${section.title} contains an invalid citation marker`);
  }
});
