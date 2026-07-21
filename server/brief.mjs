function usable(items) { return items.filter((item) => item.reviewStatus !== "rejected"); }

function compactSources(items) {
  const seen = new Set();
  return items.flatMap((item) => item.sources ?? []).filter((source) => {
    const key = `${source.evidenceSourceId}:${source.startCharacter}:${source.excerpt}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function citedItems(items, render) {
  const citations = [];
  const indexes = new Map();
  const paragraphs = items.map((item, itemIndex) => {
    const markers = compactSources([item]).map((source) => {
      const key = `${source.evidenceSourceId}:${source.startCharacter}:${source.excerpt}`;
      if (!indexes.has(key)) { citations.push(source); indexes.set(key, citations.length); }
      return indexes.get(key);
    });
    const text = render(item, itemIndex);
    return markers.length ? `${text} [${markers.join(", ")}]` : text;
  });
  return { paragraphs, citations };
}

export function buildBrief(workspace) {
  const entities = usable(workspace.entities);
  const events = usable(workspace.events);
  const indicators = usable(workspace.indicators).filter((item) => item.observed !== false);
  const people = entities.filter((item) => ["person", "alias"].includes(item.type));
  const channels = entities.filter((item) => ["phone", "email", "social_account", "messaging_account", "website", "domain"].includes(item.type));
  const financial = entities.filter((item) => ["crypto_wallet", "bank_account", "crypto_exchange", "currency"].includes(item.type));
  const transfers = events.filter((item) => item.eventType === "transfer");
  const questions = (workspace.questions ?? []).filter((item) => item.status !== "dismissed");
  const allSources = compactSources([...entities, ...events, ...indicators]);
  const marker = (item) => item.reviewStatus === "unreviewed" ? " (unreviewed)" : "";
  const chronology = [...events].sort((a, b) => (a.dateTime ?? "9999").localeCompare(b.dateTime ?? "9999"));
  const overviewEvidence = [...events.slice(0, 2), ...events.slice(-2), ...entities.slice(0, 2)];
  const overview = citedItems([{ sources: compactSources(overviewEvidence) }], () => `The submitted evidence has been organized into ${entities.length} non-rejected entit${entities.length === 1 ? "y" : "ies"}, ${events.length} non-rejected event${events.length === 1 ? "" : "s"}, and ${indicators.length} observed analytical indicator${indicators.length === 1 ? "" : "s"}. These are source-linked working findings; the available material does not independently establish identity, account ownership, criminal liability, or whether reported activity occurred outside the submitted evidence.`);
  const peopleSection = citedItems(people, (item) => `${item.displayedValue} — ${item.description ?? item.type}${marker(item)}`);
  const channelSection = citedItems(channels, (item) => `${item.displayedValue} — ${item.description ?? item.type}${marker(item)}`);
  const financialSection = citedItems(financial, (item) => `${item.displayedValue} — ${item.description ?? item.type}${marker(item)}`);
  const chronologySection = citedItems(chronology, (item) => `${item.dateTime ? new Date(item.dateTime).toLocaleDateString("en-US", { timeZone: "UTC" }) : item.approximateDate ?? "Undated"}: ${item.description}${item.amount ? ` Amount reported: ${item.amount.toLocaleString()} ${item.currency ?? ""}.` : ""}${marker(item)}`);
  const indicatorSection = citedItems(indicators, (item) => `${item.label}: ${item.explanation} This is an analytical aid, not proof. Alternative explanation: ${item.alternativeExplanation ?? "Not supplied."}${marker(item)}`);
  const questionSection = citedItems(questions, (item) => `${item.question}${item.status === "answered" ? " (marked answered)" : ""}`);
  const sections = [
    {
      title: "1. Executive case overview",
      ...overview,
    },
    {
      title: "2. Known parties and aliases",
      paragraphs: peopleSection.paragraphs.length ? peopleSection.paragraphs : ["No non-rejected person or alias entity was extracted."],
      citations: peopleSection.citations,
    },
    {
      title: "3. Communication channels",
      paragraphs: channelSection.paragraphs.length ? channelSection.paragraphs : ["No non-rejected communication-channel entity was extracted."],
      citations: channelSection.citations,
    },
    {
      title: "4. Financial accounts and wallets",
      paragraphs: financialSection.paragraphs.length ? financialSection.paragraphs : ["No non-rejected financial account, wallet, exchange, or currency entity was extracted."],
      citations: financialSection.citations,
    },
    {
      title: "5. Chronological sequence",
      paragraphs: chronologySection.paragraphs.length ? chronologySection.paragraphs : ["No non-rejected event was available for chronology."],
      citations: chronologySection.citations,
    },
    {
      title: "6. Potential scam indicators",
      paragraphs: indicatorSection.paragraphs.length ? indicatorSection.paragraphs : ["No observed, non-rejected analytical indicator is currently supported."],
      citations: indicatorSection.citations,
    },
    {
      title: "7. Evidentiary gaps",
      paragraphs: [
        "The available material does not independently verify the identity of participants, ownership of the platform, or control of any account or wallet.",
        transfers.length ? "Reported payment events should be compared with original exchange receipts and transaction records; the conversation alone is not transaction proof." : "No reviewed transfer event is available.",
        "Further verification would be required before drawing legal or attribution conclusions.",
      ], citations: [],
    },
    {
      title: "8. Suggested investigative questions",
      paragraphs: questionSection.paragraphs.length ? questionSection.paragraphs : [
        "Which original records could independently corroborate the highest-impact statements in the submitted evidence?",
        "Which extracted identifiers can be compared lawfully with authorized records or other reported cases?",
        "What timeline gaps or conflicting accounts should be resolved before drawing conclusions?",
        "Which findings still require a human confirmation, correction, or rejection decision?",
      ], citations: questionSection.citations,
    },
    {
      title: "9. Appendix of cited source excerpts",
      paragraphs: allSources.map((source, index) => `[${index + 1}] ${source.excerpt}`),
      citations: allSources,
    },
  ];
  return {
    generatedAt: new Date().toISOString(), sections,
    disclaimer: "EvidenceWeaver organizes submitted information and highlights possible patterns. It does not establish identity, criminal liability, or legal conclusions. All findings require qualified human review.",
  };
}
