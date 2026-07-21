import { randomUUID } from "node:crypto";

function evidenceLocator(workspace) {
  const all = workspace.evidence;
  return (needle) => {
    for (const source of all) {
      const line = source.rawText.split("\n").find((candidate) => candidate.includes(needle));
      if (!line) continue;
      const startCharacter = source.rawText.indexOf(line);
      const prefix = source.rawText.slice(0, startCharacter);
      return {
        evidenceSourceId: source.id,
        startCharacter,
        endCharacter: startCharacter + line.length,
        messageIndex: prefix ? prefix.split("\n").length : 1,
        excerpt: line,
      };
    }
    if (!all.length) throw new Error("Add at least one evidence source before extraction.");
    throw new Error(`The deterministic demo fixture could not find its expected excerpt: ${needle}`);
  };
}

export function createMockExtraction(workspace) {
  if (workspace.evidence.some((source) => source.rawText.includes("CEDAR-TX-01"))) return createThirdMockExtraction(workspace);
  if (workspace.evidence.some((source) => source.rawText.includes("PAPER-TX-01"))) return createLinkedMockExtraction(workspace);
  const ref = evidenceLocator(workspace);
  const caseId = workspace.case.id;
  const entity = (key, type, displayedValue, description, confidence, needle) => ({
    id: `ent-${key}`, caseId, type, displayedValue, normalizedValue: displayedValue.toLowerCase(), description,
    confidence, reviewStatus: "unreviewed", sources: [ref(needle)],
  });
  const entities = [
    entity("evan", "person", "Evan", "Conversation participant who reports transfers and a blocked withdrawal.", .99, "I'm Evan"),
    entity("maya", "person", "Maya Chen", "Conversation participant who introduces the investment platform.", .98, "I'm Maya Chen"),
    entity("lin", "alias", "Lin", "Nickname Maya says she uses with family; identity equivalence remains a self-report.", .88, "nickname Lin"),
    entity("luma", "messaging_account", "maya.orchid", "Account used after the conversation moves to LumaChat.", .98, "maya.orchid"),
    entity("domain", "domain", "harbor-lantern.example", "Clearly fictional demonstration domain for the investment site.", .99, "harbor-lantern.example"),
    entity("company", "company", "Harbor Lantern Markets", "Name displayed by the fictional platform.", .97, "Harbor Lantern Markets"),
    entity("wallet-eth", "crypto_wallet", "0xF1C7100A0000000000000000000000000000E001", "Synthetic EVM-style deposit identifier; not a real wallet.", .99, "0xF1C7100A"),
    entity("wallet-btc", "crypto_wallet", "bc1qsynthetic00000000000000000000000000demo", "Synthetic Bitcoin-style identifier supplied for a fee; not a real wallet.", .99, "bc1qsynthetic"),
    entity("exchange", "crypto_exchange", "Northstar Exchange", "Fictional exchange named as the source and destination for transfers.", .96, "Northstar Exchange"),
    entity("halcyon", "company", "Halcyon Beacon Digital LLC", "Unverified owner name displayed by the site.", .76, "Halcyon Beacon Digital LLC"),
  ];
  const ids = Object.fromEntries(entities.map((item) => [item.id.replace("ent-", ""), item.id]));
  const event = (key, eventType, dateTime, description, entityIds, confidence, needle, extra = {}) => ({
    id: `evt-${key}`, caseId, eventType, dateTime, approximateDate: undefined, description, entityIds,
    confidence, reviewStatus: "unreviewed", sources: [ref(needle)], ...extra,
  });
  const events = [
    event("contact", "initial_contact", "2026-04-11T13:00:00Z", "Maya opens with an apparently accidental message intended for someone named Daniel.", [ids.maya, ids.evan], .99, "photography group"),
    event("platform", "platform_change", "2026-04-11T20:49:00Z", "Maya asks Evan to continue on LumaChat using maya.orchid.", [ids.maya, ids.evan, ids.luma], .99, "Do you use LumaChat"),
    event("intro", "investment_introduction", "2026-04-15T14:31:00Z", "Maya introduces a fictional crypto-investment training site.", [ids.maya, ids.evan, ids.domain, ids.company], .99, "training site is"),
    event("first", "transfer", "2026-04-17T14:36:00Z", "Evan reports sending 250 USDT to the displayed deposit address.", [ids.evan, ids["wallet-eth"], ids.exchange], .99, "sent $250", { amount: 250, currency: "USDT" }),
    event("return", "reported_profit", "2026-04-18T15:45:00Z", "The platform display reports a balance of $287.50 after a short order.", [ids.evan, ids.company], .98, "shows $287.50", { amount: 287.5, currency: "USD" }),
    event("test-withdraw", "transfer", "2026-04-18T19:13:00Z", "Evan reports that a $50 test withdrawal arrived at Northstar.", [ids.evan, ids.exchange], .97, "$50 arrived", { amount: 50, currency: "USD" }),
    event("second", "transfer", "2026-04-19T14:21:00Z", "Evan reports a second transfer of 2,000 USDT to the same address.", [ids.evan, ids["wallet-eth"]], .99, "sent $2,000 USDT", { amount: 2000, currency: "USDT" }),
    event("third", "transfer", "2026-04-20T19:31:00Z", "Evan reports another 2,000 transfer under a deadline.", [ids.evan, ids["wallet-eth"]], .99, "sent another $2,000", { amount: 2000, currency: "USDT" }),
    event("withdraw", "withdrawal_attempt", "2026-04-21T14:45:00Z", "Evan says he wants to withdraw $5,000 from the displayed balance.", [ids.evan, ids.company], .98, "withdraw $5,000", { amount: 5000, currency: "USD" }),
    event("blocked", "withdrawal_blocked", "2026-04-21T16:59:00Z", "Evan reports that the withdrawal status changed to blocked.", [ids.evan, ids.company], .99, "status changed to blocked"),
    event("fee", "fee_demand", "2026-04-21T18:13:00Z", "A notice reportedly demands a $1,296 verification reserve before release.", [ids.evan, ids.company], .98, "verification reserve required", { amount: 1296, currency: "USD" }),
    event("pressure", "money_request", "2026-04-22T15:27:00Z", "Support reportedly pressures Evan to pay within 24 hours.", [ids.evan, ids.company, ids["wallet-btc"]], .97, "pay within 24 hours"),
    event("offline", "other", "2026-04-23T15:03:00Z", "Evan reports that the website stopped loading.", [ids.evan, ids.domain], .96, "website stopped loading"),
  ];
  const eventIds = Object.fromEntries(events.map((item) => [item.id.replace("evt-", ""), item.id]));
  const relationship = (key, sourceEntityId, targetEntityId, relationshipType, description, confidence, needle) => ({
    id: `rel-${key}`, caseId, sourceEntityId, targetEntityId, relationshipType, description, confidence, sources: [ref(needle)],
  });
  const relationships = [
    relationship("contact", ids.maya, ids.evan, "communicated_with", "The two participants communicate throughout the submitted conversation.", .99, "Hi, is this Daniel"),
    relationship("alias", ids.maya, ids.lin, "used_alias", "Maya says Lin is a family nickname.", .88, "nickname Lin"),
    relationship("account", ids.maya, ids.luma, "controlled_account", "Maya supplies maya.orchid as her LumaChat handle.", .97, "handle is maya.orchid"),
    relationship("site", ids.maya, ids.domain, "directed_to", "Maya directs Evan to the training site.", .99, "training site is"),
    relationship("wallet", ids.evan, ids["wallet-eth"], "sent_funds_to", "Evan reports multiple transfers to the displayed deposit address.", .99, "sent $2,000 USDT"),
    relationship("exchange", ids.evan, ids.exchange, "associated_with", "Evan uses Northstar for the reported test transfer and withdrawal.", .95, "$50 arrived at Northstar"),
    relationship("operator", ids.company, ids.halcyon, "associated_with", "The site displays Halcyon Beacon Digital LLC as owner, but Evan cannot independently verify it.", .72, "site says Halcyon"),
    relationship("fee-wallet", ids.company, ids["wallet-btc"], "directed_to", "Support reportedly supplies this second synthetic identifier for the fee.", .96, "Support gave a second wallet"),
  ];
  const indicator = (key, label, explanation, severity, confidence, eventKeys, needle, alternativeExplanation, missingEvidence) => ({
    id: `ind-${key}`, caseId, category: "relationship_investment_pattern", label, explanation, severity, confidence,
    supportingEntityIds: [ids.maya, ids.evan], supportingEventIds: eventKeys.map((id) => eventIds[id]).filter(Boolean),
    sources: [ref(needle)], reviewStatus: "unreviewed", observed: true, stageNumber: Number(label.match(/^\d+/)?.[0]), alternativeExplanation, missingEvidence,
  });
  const indicators = [
    indicator("contact", "1 · Initial contact", "The conversation begins as an apparent wrong-number contact.", "moderate", .97, ["contact"], "Wrong number", "A genuine mistaken contact is possible.", "No independent phone-account records are available."),
    indicator("trust", "2 · Trust cultivation", "Repeated personal and supportive conversation precedes financial discussion.", "moderate", .88, [], "Meeting sincere people helps", "The messages could reflect a genuine developing friendship.", "Only the submitted conversation is available."),
    indicator("migration", "3 · Private-channel migration", "The contact asks to move from the initial phone to LumaChat.", "moderate", .96, ["platform"], "Do you use LumaChat", "People commonly prefer a different messaging service.", "The original platform metadata is unavailable."),
    indicator("wealth", "4 · Lifestyle or wealth presentation", "Messages discuss a design studio, time freedom, and investing.", "low", .68, [], "time freedom", "Ordinary life conversation may explain these comments.", "No financial records corroborate lifestyle claims."),
    indicator("investment", "5 · Investment introduction", "A personal contact introduces a crypto-investment site and invitation code.", "high", .98, ["intro"], "training site is", "A legitimate referral could use an invitation code.", "The platform operator and licensing are unverified."),
    indicator("commitment", "6 · Small initial commitment", "Evan reports a $250 first transfer.", "high", .99, ["first"], "sent $250", "A small transfer can be a normal risk-control measure.", "No blockchain or exchange record is attached."),
    indicator("profit", "7 · Apparent profit reinforcement", "The interface shows a gain and a small withdrawal reportedly succeeds.", "high", .96, ["return", "test-withdraw"], "$50 arrived", "A legitimate platform may permit test withdrawals.", "Displayed balances are not independently verified."),
    indicator("pressure", "8 · Increased-deposit pressure", "A time-limited tier is used to encourage two larger transfers.", "high", .97, ["second", "third"], "finish the tier by 3 PM", "Some legitimate offerings have deadlines.", "No platform terms or independent notices are available."),
    indicator("obstruction", "9 · Withdrawal obstruction", "A requested withdrawal is reportedly blocked.", "high", .99, ["withdraw", "blocked"], "status changed to blocked", "Compliance reviews can temporarily delay legitimate withdrawals.", "No direct platform correspondence or account ledger is attached."),
    indicator("fee", "10 · Additional fee demand", "A separate refundable reserve is demanded before funds are released.", "high", .99, ["fee", "pressure"], "verification reserve required", "Some services may require documented reserves, though the stated procedure is unverified.", "The legal basis, recipient ownership, and terms are unknown."),
    indicator("urgency", "11 · Threat, shame, urgency, or isolation", "A short payment window and risk of a continued freeze create escalating urgency.", "high", .97, ["pressure"], "Please act quickly", "A legitimate compliance deadline could also create urgency.", "No authentic platform policy or compliance correspondence is available."),
    {
      id: "ind-recovery", caseId, category: "relationship_investment_pattern", label: "12 · Recovery-scam exposure",
      explanation: "No later contact offering paid recovery services appears in the submitted evidence.", confidence: .94, severity: "low",
      supportingEntityIds: [], supportingEventIds: [], sources: [], reviewStatus: "unreviewed", observed: false, stageNumber: 12,
      alternativeExplanation: "A recovery solicitation could occur outside the submitted date range.", missingEvidence: "Later communications and reports from other channels are unavailable.",
    },
  ];
  const coercionSignals = [
    {
      id: "coer-quota", caseId, category: "work_quotas", label: "Possible quota-linked movement restriction",
      explanation: "Maya reports that a manager jokes nobody leaves before a daily quota is completed. The wording may indicate a workplace quota or restricted movement, but context is insufficient.",
      speaker: "Maya", dateTime: "2026-04-13T20:35:00Z", confidence: .55,
      alternativeExplanation: "This may be figurative workplace humor about overtime rather than literal confinement.", reviewPriority: "elevated",
      relatedEntityIds: [ids.maya], sources: [ref("nobody leaves before the daily quota")], reviewStatus: "unreviewed",
    },
    {
      id: "coer-monitoring", caseId, category: "communication_surveillance", label: "Possible workplace communication monitoring",
      explanation: "Maya says work chats are checked during shifts. This may warrant contextual review for surveillance or control.",
      speaker: "Maya", dateTime: "2026-04-23T17:17:00Z", confidence: .44,
      alternativeExplanation: "Routine employer monitoring of company devices or customer-service quality control could explain the statement.", reviewPriority: "routine",
      relatedEntityIds: [ids.maya, ids.luma], sources: [ref("check our work chats during shifts")], reviewStatus: "unreviewed",
    },
  ];
  return { entities, events, relationships, indicators, coercionSignals };
}

function createLinkedMockExtraction(workspace) {
  const ref = evidenceLocator(workspace);
  const caseId = workspace.case.id;
  const entity = (key, type, displayedValue, description, confidence, needle) => ({ id: `ent-paper-${key}`, caseId, type, displayedValue, normalizedValue: displayedValue.toLowerCase(), description, confidence, reviewStatus: "unreviewed", sources: [ref(needle)] });
  const entities = [
    entity("noah", "person", "Noah", "Participant who reports transfers and a pending withdrawal.", .98, "Hi Noah"),
    entity("aria", "person", "Aria Vale", "Contact who introduces the fictional investment platform.", .98, "I am Aria Vale"),
    entity("quietwire", "messaging_account", "aria.starlight", "QuietWire handle supplied by Aria.", .98, "aria.starlight"),
    entity("domain", "domain", "harbor-lantern.example", "Fictional domain also observed in another synthetic case.", .99, "harbor-lantern.example"),
    entity("company", "company", "Harbor Lantern Markets", "Name displayed by the fictional platform.", .97, "Harbor Lantern Markets"),
    entity("wallet", "crypto_wallet", "0xF1C7100A0000000000000000000000000000E001", "Synthetic deposit identifier also observed in another synthetic case.", .99, "0xF1C7100A"),
  ];
  const ids = Object.fromEntries(entities.map((item) => [item.id.replace("ent-paper-", ""), item.id]));
  const event = (key, eventType, dateTime, description, entityIds, confidence, needle, extra = {}) => ({ id: `evt-paper-${key}`, caseId, eventType, dateTime, description, entityIds, confidence, reviewStatus: "unreviewed", sources: [ref(needle)], ...extra });
  const events = [
    event("contact", "initial_contact", "2026-05-03T12:00:00Z", "Aria contacts Noah through an apparent mistaken referral.", [ids.aria, ids.noah], .94, "hiking forum"),
    event("platform", "platform_change", "2026-05-04T13:55:00Z", "Aria asks Noah to move to QuietWire.", [ids.aria, ids.noah, ids.quietwire], .98, "use QuietWire"),
    event("intro", "investment_introduction", "2026-05-05T12:39:00Z", "Aria introduces the fictional Harbor Lantern site.", [ids.aria, ids.noah, ids.domain, ids.company], .99, "training site is"),
    event("first", "transfer", "2026-05-06T14:12:00Z", "Noah reports sending 300 USDT to the shared synthetic wallet.", [ids.noah, ids.wallet], .99, "sent $300 USDT", { amount: 300, currency: "USDT" }),
    event("profit", "reported_profit", "2026-05-07T15:23:00Z", "The dashboard reportedly displays $352.", [ids.noah, ids.company], .96, "dashboard shows $352", { amount: 352, currency: "USD" }),
    event("second", "transfer", "2026-05-07T14:07:00Z", "Noah reports a further 1,500 USDT transfer under a deadline.", [ids.noah, ids.wallet], .99, "sent $1,500 USDT", { amount: 1500, currency: "USDT" }),
    event("withdraw", "withdrawal_attempt", "2026-05-07T15:18:00Z", "Noah reports a pending $1,000 withdrawal.", [ids.noah, ids.company], .97, "$1,000 withdrawal", { amount: 1000, currency: "USD" }),
    event("fee", "fee_demand", "2026-05-08T12:29:00Z", "Support reportedly demands an external verification reserve.", [ids.noah, ids.company], .98, "verification reserve required"),
    event("pressure", "money_request", "2026-05-08T13:40:00Z", "A further $400 is requested within 12 hours.", [ids.noah, ids.company], .98, "another $400", { amount: 400, currency: "USD" }),
  ];
  const eventIds = Object.fromEntries(events.map((item) => [item.id.replace("evt-paper-", ""), item.id]));
  const relationship = (key, sourceEntityId, targetEntityId, relationshipType, description, confidence, needle) => ({ id: `rel-paper-${key}`, caseId, sourceEntityId, targetEntityId, relationshipType, description, confidence, sources: [ref(needle)] });
  const relationships = [
    relationship("contact", ids.aria, ids.noah, "communicated_with", "Aria and Noah communicate in the submitted source.", .99, "Hi Noah"),
    relationship("account", ids.aria, ids.quietwire, "controlled_account", "Aria supplies the QuietWire handle.", .98, "aria.starlight"),
    relationship("site", ids.aria, ids.domain, "directed_to", "Aria directs Noah to the fictional domain.", .99, "training site is"),
    relationship("wallet", ids.noah, ids.wallet, "sent_funds_to", "Noah reports sending funds to the synthetic wallet.", .99, "sent $1,500 USDT"),
  ];
  const stage = (number, key, label, explanation, needle, eventKeys = [], severity = "moderate", confidence = .9) => ({
    id: `ind-paper-${key}`, caseId, category: "relationship_investment_pattern", label: `${number} · ${label}`, explanation,
    confidence, severity, supportingEntityIds: [ids.aria, ids.noah], supportingEventIds: eventKeys.map((id) => eventIds[id]).filter(Boolean),
    sources: [ref(needle)], reviewStatus: "unreviewed", observed: true, stageNumber: number,
    alternativeExplanation: "A legitimate social or investment interaction could contain a similar isolated feature.", missingEvidence: "Independent identity, platform, and transaction records are unavailable.",
  });
  const absent = (number, key, label) => ({ id: `ind-paper-${key}`, caseId, category: "relationship_investment_pattern", label: `${number} · ${label}`, explanation: `This stage is not observed in the submitted evidence.`, confidence: .9, severity: "low", supportingEntityIds: [], supportingEventIds: [], sources: [], reviewStatus: "unreviewed", observed: false, stageNumber: number, alternativeExplanation: "The behavior may have occurred outside the submitted messages.", missingEvidence: "Additional communications are unavailable." });
  const indicators = [
    stage(1, "contact", "Initial contact", "The exchange begins with an uncertain referral.", "hiking forum", ["contact"]),
    stage(2, "trust", "Trust or relationship cultivation", "Aria compliments Noah after the apparent mistake.", "You seem kind"),
    stage(3, "migration", "Migration to private communications", "Aria asks to move to QuietWire.", "use QuietWire", ["platform"]),
    absent(4, "wealth", "Lifestyle or wealth presentation"),
    stage(5, "intro", "Investment introduction", "Aria introduces a fictional crypto platform.", "training site is", ["intro"], "high", .98),
    stage(6, "small", "Small initial commitment", "Noah reports a 300 USDT first transfer.", "sent $300 USDT", ["first"], "high", .99),
    stage(7, "profit", "Apparent profit reinforcement", "The dashboard reportedly shows a gain.", "dashboard shows $352", ["profit"], "high", .96),
    stage(8, "pressure", "Increased deposit pressure", "A tier deadline precedes a larger transfer.", "higher tier closes tonight", ["second"], "high", .97),
    stage(9, "obstruction", "Withdrawal obstruction", "The withdrawal remains pending compliance.", "pending compliance", ["withdraw"], "high", .94),
    stage(10, "fee", "Additional fee or tax demand", "Support reportedly demands a reserve before release.", "verification reserve required", ["fee"], "high", .98),
    stage(11, "urgency", "Threat, shame, urgency, or isolation", "A 12-hour deadline and freeze warning create urgency.", "within 12 hours", ["pressure"], "high", .97),
    absent(12, "recovery", "Recovery-scam exposure"),
  ];
  return { entities, events, relationships, indicators, coercionSignals: [] };
}

function createThirdMockExtraction(workspace) {
  const ref = evidenceLocator(workspace);
  const caseId = workspace.case.id;
  const entity = (key, type, displayedValue, description, confidence, needle) => ({ id: `ent-cedar-${key}`, caseId, type, displayedValue, normalizedValue: displayedValue.toLowerCase(), description, confidence, reviewStatus: "unreviewed", sources: [ref(needle)] });
  const entities = [
    entity("june", "person", "June", "Participant who reports two transfers and a pending withdrawal.", .98, "wrong person"),
    entity("rowan", "person", "Rowan Hale", "Contact who introduces a fictional agricultural-investment program.", .98, "I'm Rowan Hale"),
    entity("pinechat", "messaging_account", "rowan.cedar", "PineChat handle supplied by Rowan.", .98, "rowan.cedar"),
    entity("domain", "domain", "cedar-echo.example", "Fictional domain unique to this synthetic scenario.", .99, "cedar-echo.example"),
    entity("company", "company", "Cedar Echo Agricultural Notes", "Fictional program name displayed by the portal.", .97, "Cedar Echo Agricultural Notes"),
    entity("deposit", "crypto_wallet", "0xCE00000000000000000000000000000000000003", "Synthetic deposit identifier unique to this case.", .99, "0xCE000000"),
    entity("fee", "crypto_wallet", "bc1qsynthetic00000000000000000000000000demo", "Synthetic fee identifier also submitted in Operation Glass Harbor.", .99, "bc1qsynthetic"),
  ];
  const ids = Object.fromEntries(entities.map((item) => [item.id.replace("ent-cedar-", ""), item.id]));
  const event = (key, eventType, dateTime, description, entityIds, confidence, needle, extra = {}) => ({ id: `evt-cedar-${key}`, caseId, eventType, dateTime, description, entityIds, confidence, reviewStatus: "unreviewed", sources: [ref(needle)], ...extra });
  const events = [
    event("contact", "initial_contact", "2026-06-08T11:00:00Z", "Rowan contacts June through an apparently mistaken estate-sale inquiry.", [ids.rowan, ids.june], .96, "estate-sale ceramic"),
    event("platform", "platform_change", "2026-06-09T12:05:00Z", "Rowan asks June to move the conversation to PineChat.", [ids.rowan, ids.june, ids.pinechat], .98, "PineChat"),
    event("intro", "investment_introduction", "2026-06-10T11:44:00Z", "Rowan introduces a fictional fractional-greenhouse program.", [ids.rowan, ids.june, ids.domain, ids.company], .98, "fractional greenhouse leases"),
    event("first", "transfer", "2026-06-11T11:36:00Z", "June reports sending 180 USDC to the synthetic deposit wallet.", [ids.june, ids.deposit], .99, "sent 180 USDC", { amount: 180, currency: "USDC" }),
    event("profit", "reported_profit", "2026-06-11T12:49:00Z", "The portal reportedly displays 214 USDC after a harvest cycle.", [ids.june, ids.company], .97, "shows 214 USDC", { amount: 214, currency: "USDC" }),
    event("second", "transfer", "2026-06-12T16:41:00Z", "June reports a further 1,200 USDC transfer under a seasonal deadline.", [ids.june, ids.deposit], .99, "sent 1,200 USDC", { amount: 1200, currency: "USDC" }),
    event("withdraw", "withdrawal_attempt", "2026-06-12T11:54:00Z", "June reports a 700 USDC withdrawal pending inspection.", [ids.june, ids.company], .97, "700 USDC withdrawal", { amount: 700, currency: "USDC" }),
    event("fee", "fee_demand", "2026-06-12T12:07:00Z", "Support reportedly requires a separate reserve before release.", [ids.june, ids.company, ids.fee], .98, "verification reserve required", { amount: 280, currency: "USDC" }),
    event("pressure", "money_request", "2026-06-13T14:33:00Z", "A further payment is requested within 18 hours with a freeze warning.", [ids.june, ids.company, ids.fee], .98, "within 18 hours", { amount: 280, currency: "USDC" }),
    event("offline", "other", "2026-06-14T11:12:00Z", "June reports that the fictional Cedar Echo site became unavailable.", [ids.june, ids.domain, ids.company], .96, "site is unavailable"),
  ];
  const eventIds = Object.fromEntries(events.map((item) => [item.id.replace("evt-cedar-", ""), item.id]));
  const relationship = (key, sourceEntityId, targetEntityId, relationshipType, description, confidence, needle) => ({ id: `rel-cedar-${key}`, caseId, sourceEntityId, targetEntityId, relationshipType, description, confidence, sources: [ref(needle)] });
  const relationships = [
    relationship("contact", ids.rowan, ids.june, "communicated_with", "Rowan and June communicate throughout the submitted source.", .99, "estate-sale ceramic"),
    relationship("account", ids.rowan, ids.pinechat, "controlled_account", "Rowan supplies the PineChat handle.", .98, "rowan.cedar"),
    relationship("site", ids.rowan, ids.domain, "directed_to", "Rowan directs June to the fictional Cedar Echo domain.", .99, "information site is"),
    relationship("deposit", ids.june, ids.deposit, "sent_funds_to", "June reports two transfers to the synthetic deposit wallet.", .99, "sent 1,200 USDC"),
    relationship("fee", ids.company, ids.fee, "directed_to", "The separate reserve is reportedly directed to a synthetic identifier seen in another case.", .98, "bc1qsynthetic"),
  ];
  const stage = (number, key, label, explanation, needle, eventKeys = [], severity = "moderate", confidence = .9) => ({
    id: `ind-cedar-${key}`, caseId, category: "relationship_investment_pattern", label: `${number} · ${label}`, explanation,
    confidence, severity, supportingEntityIds: [ids.rowan, ids.june], supportingEventIds: eventKeys.map((id) => eventIds[id]).filter(Boolean),
    sources: [ref(needle)], reviewStatus: "unreviewed", observed: true, stageNumber: number,
    alternativeExplanation: "A legitimate social, cooperative, or investment interaction could contain a similar isolated feature.", missingEvidence: "Independent identity, operator, platform, and transaction records are unavailable.",
  });
  const absent = (number, key, label) => ({ id: `ind-cedar-${key}`, caseId, category: "relationship_investment_pattern", label: `${number} · ${label}`, explanation: "This stage is not observed in the submitted evidence.", confidence: .9, severity: "low", supportingEntityIds: [], supportingEventIds: [], sources: [], reviewStatus: "unreviewed", observed: false, stageNumber: number, alternativeExplanation: "The behavior may have occurred outside the submitted messages.", missingEvidence: "Additional communications are unavailable." });
  const indicators = [
    stage(1, "contact", "Initial contact", "The conversation begins with an apparently mistaken estate-sale inquiry.", "estate-sale ceramic", ["contact"]),
    stage(2, "trust", "Trust or relationship cultivation", "Rowan builds rapport around patience and craft.", "patient craft"),
    stage(3, "migration", "Migration to private communications", "Rowan asks to move the conversation to PineChat.", "PineChat", ["platform"]),
    absent(4, "wealth", "Lifestyle or wealth presentation"),
    stage(5, "intro", "Investment introduction", "Rowan introduces a fictional fractional-greenhouse program.", "fractional greenhouse leases", ["intro"], "high", .97),
    stage(6, "small", "Small initial commitment", "June reports a 180 USDC demonstration transfer.", "sent 180 USDC", ["first"], "high", .99),
    stage(7, "profit", "Apparent profit reinforcement", "The portal reportedly shows a gain after the first cycle.", "shows 214 USDC", ["profit"], "high", .97),
    stage(8, "pressure", "Increased deposit pressure", "A closing seasonal pool precedes a larger transfer.", "seasonal pool closes tonight", ["second"], "high", .97),
    stage(9, "obstruction", "Withdrawal obstruction", "The withdrawal remains pending inspection.", "pending inspection", ["withdraw"], "high", .95),
    stage(10, "fee", "Additional fee or tax demand", "Support reportedly demands a separate reserve before release.", "verification reserve required", ["fee"], "high", .98),
    stage(11, "urgency", "Threat, shame, urgency, or isolation", "An 18-hour deadline and freeze warning create urgency.", "within 18 hours", ["pressure"], "high", .97),
    absent(12, "recovery", "Recovery-scam exposure"),
  ];
  return { entities, events, relationships, indicators, coercionSignals: [] };
}

export function newId(prefix) { return `${prefix}-${randomUUID()}`; }
