function usable(items) { return (items ?? []).filter((item) => item.reviewStatus !== "rejected"); }

export function buildInvestigatorQuestions(workspace) {
  const entities = usable(workspace.entities);
  const events = usable(workspace.events);
  const questions = [];
  const add = (key, question, whyItMatters, promptedBy, informationNeeded, priority, entityIds, eventIds, sources, confidence = .9) => {
    if (!sources?.length) return;
    questions.push({ id: `question-${key}`, caseId: workspace.case.id, question, whyItMatters, promptedBy, informationNeeded, priority, confidence, supportingEntityIds: entityIds, supportingEventIds: eventIds, sources, status: "proposed" });
  };
  const domain = entities.find((item) => ["domain", "website"].includes(item.type));
  if (domain) add("domain", `Can the registration, hosting, and ownership history of ${domain.displayedValue} be lawfully obtained?`, "Independent infrastructure records may corroborate or contradict the operator claims in the submitted text.", `The evidence directs a participant to ${domain.displayedValue}.`, "Registrar records, historical DNS/hosting records, and authenticated platform documents obtained through authorized channels.", "high", [domain.id], [], domain.sources, .94);
  for (const wallet of entities.filter((item) => item.type === "crypto_wallet").slice(0, 2)) {
    const relatedEvents = events.filter((event) => event.entityIds.includes(wallet.id));
    add(`wallet-${wallet.id}`, `Was ${wallet.displayedValue} used in other reported cases or attributed through authorized exchange records?`, "An exact identifier match can connect submitted evidence, while lawful attribution requires independent records.", `The identifier is cited in ${relatedEvents.length || 1} proposed event${relatedEvents.length === 1 ? "" : "s"}.`, "Original transaction records, receiving-service records, and exact matches in authorized case repositories.", "high", [wallet.id], relatedEvents.map((event) => event.id), wallet.sources, .96);
  }
  const transfers = events.filter((item) => item.eventType === "transfer");
  if (transfers.length) add("transfers", "Do original exchange receipts and ledger records corroborate each reported transfer timestamp, amount, asset, and destination?", "Conversation statements and displayed transaction references are not independent proof that a transfer settled as described.", `${transfers.length} transfer event${transfers.length === 1 ? " is" : "s are"} proposed from the submitted conversation.`, "Authenticated exchange statements, transaction hashes, asset/network details, timestamps, and destination identifiers.", "high", [...new Set(transfers.flatMap((event) => event.entityIds))], transfers.map((event) => event.id), transfers.flatMap((event) => event.sources).slice(0, 4), .99);
  const account = entities.find((item) => ["messaging_account", "social_account", "phone", "email"].includes(item.type));
  if (account) add("account", `Can control of ${account.displayedValue} during the relevant period be independently verified through authorized records?`, "A self-reported handle does not establish the real-world identity of its user.", `The account is presented as a communication channel in the submitted evidence.`, "Provider records obtained through lawful process, account creation/recovery history, and preserved message metadata.", "medium", [account.id], [], account.sources, .88);
  const profit = events.find((item) => item.eventType === "reported_profit");
  if (profit) add("balance", "Was the platform’s displayed balance independently backed by assets or executable withdrawal rights?", "An on-screen gain may be a display claim rather than a realizable return.", profit.description, "Authenticated account ledger, custody records, withdrawal history, and independently verifiable asset movements.", "high", profit.entityIds, [profit.id], profit.sources, .95);
  const fee = events.find((item) => item.eventType === "fee_demand");
  if (fee) add("fee", "What documented policy or legal basis supports the separate payment demanded before release of funds?", "A separate advance payment before withdrawal is a high-priority fact to verify, but its legitimacy cannot be resolved from messages alone.", fee.description, "Original terms, compliance notice, regulator or tax authority documentation, recipient ownership, and payment instructions.", "high", fee.entityIds, [fee.id], fee.sources, .97);
  const alias = entities.find((item) => item.type === "alias");
  if (alias) add("alias", `What independent evidence, if any, links the alias “${alias.displayedValue}” to another identified person or account?`, "The tool must not infer identity solely from a self-reported nickname or similar name.", alias.description ?? "An alias was extracted from the conversation.", "Authorized account records, corroborating communications, and reliable identity documentation.", "medium", [alias.id], [], alias.sources, .86);
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return questions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}
