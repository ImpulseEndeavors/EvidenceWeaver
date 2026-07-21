import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { linkedSyntheticConversation, syntheticConversation, thirdSyntheticConversation } from "./seed";
import { Tutorial, tutorialSteps } from "./Tutorial";
import type { AppConfig, CaseEvent, CaseWorkspace, CrossCaseMatch, CustodyOverview, ExtractedEntity, Inspectable, ReviewStatus, SourceReference } from "./types";

export type View = "dashboard" | "evidence" | "entities" | "timeline" | "map" | "linked" | "analysis" | "coercion" | "questions" | "brief" | "custody";
const nav: Array<{ id: View; label: string; icon: string }> = [
  { id: "dashboard", label: "Case overview", icon: "⌂" }, { id: "evidence", label: "Evidence", icon: "▤" },
  { id: "entities", label: "Entities", icon: "◎" }, { id: "timeline", label: "Timeline", icon: "◷" },
  { id: "map", label: "Relationship map", icon: "⌘" }, { id: "linked", label: "Linked cases", icon: "⊞" },
  { id: "analysis", label: "Pattern analysis", icon: "◇" }, { id: "coercion", label: "Coercion signals", icon: "△" },
  { id: "questions", label: "Next questions", icon: "?" },
  { id: "brief", label: "Case brief", icon: "≡" },
  { id: "custody", label: "Custody record", icon: "♢" },
];
const eventLabels: Record<string, string> = {
  initial_contact: "Initial contact", platform_change: "Platform change", relationship_development: "Relationship development",
  investment_introduction: "Investment introduced", account_creation: "Account creation", money_request: "Money request",
  transfer: "Transfer", reported_profit: "Reported profit", withdrawal_attempt: "Withdrawal attempt",
  withdrawal_blocked: "Withdrawal blocked", fee_demand: "Fee demand", threat: "Threat", communication: "Communication", other: "Other",
};
const entityLabels: Record<string, string> = { person: "Person", alias: "Alias", messaging_account: "Messaging", crypto_wallet: "Wallet", crypto_exchange: "Exchange", domain: "Domain", website: "Website", company: "Company", phone: "Phone", email: "Email", organization: "Organization", social_account: "Social", bank_account: "Bank account", ip_address: "IP address", physical_location: "Location", currency: "Currency", other: "Other" };

function confidence(value: number) { return `${Math.round(value * 100)}%`; }
function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function itemKind(item: Inspectable): "entities" | "events" | "indicators" | "relationships" | "coercionSignals" | "questions" {
  if (item.id.startsWith("ent-")) return "entities";
  if (item.id.startsWith("evt-")) return "events";
  if (item.id.startsWith("ind-")) return "indicators";
  if (item.id.startsWith("coer-")) return "coercionSignals";
  if (item.id.startsWith("question-")) return "questions";
  return "relationships";
}
function itemTitle(item: Inspectable) {
  if ("displayedValue" in item) return item.displayedValue;
  if ("eventType" in item) return eventLabels[item.eventType] ?? titleCase(item.eventType);
  if ("label" in item) return item.label;
  if ("question" in item) return item.question;
  return titleCase(item.relationshipType);
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) { return <div className="empty"><div className="empty-mark">⌁</div><h3>{title}</h3><p>{body}</p>{action}</div>; }

const comparisonDemos = [
  { title: "Operation Paper Comet", description: "Synthetic cross-case linking demonstration", evidenceTitle: "Synthetic QuietWire conversation · 2026", rawText: linkedSyntheticConversation },
  { title: "Operation Cedar Echo", description: "Synthetic agricultural-investment comparison case", evidenceTitle: "Synthetic PineChat conversation · 2026", rawText: thirdSyntheticConversation },
];

async function ensureComparisonDemoCases(existingCases: CaseWorkspace[]) {
  let nextCases = existingCases;
  for (const demo of comparisonDemos) {
    let comparison = nextCases.find((item) => item.case.synthetic && item.case.title === demo.title);
    if (!comparison) {
      comparison = await api.createCase({ title: demo.title, description: demo.description, synthetic: true });
      nextCases = [...nextCases, comparison];
    }
    if (!comparison.evidence.length) comparison = await api.addEvidence(comparison.case.id, { title: demo.evidenceTitle, rawText: demo.rawText, sourceType: "pasted_text" });
    if (!comparison.extraction || comparison.extraction.stale || !comparison.entities.length) comparison = await api.extract(comparison.case.id, "mock");
    nextCases = nextCases.map((item) => item.case.id === comparison.case.id ? comparison : item);
  }
  return nextCases;
}

function App() {
  const [cases, setCases] = useState<CaseWorkspace[]>([]);
  const [caseId, setCaseId] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [selected, setSelected] = useState<Inspectable | null>(null);
  const [activeSourceId, setActiveSourceId] = useState("");
  const [highlight, setHighlight] = useState<SourceReference | null>(null);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const operationInFlight = useRef(false);

  const current = cases.find((item) => item.case.id === caseId) ?? cases[0];
  const replaceCurrent = (next: CaseWorkspace) => { setCases((items) => items.map((item) => item.case.id === next.case.id ? next : item)); setSelected((prior) => prior ? [...next.entities, ...next.events, ...next.relationships, ...next.indicators, ...next.coercionSignals, ...next.questions].find((item) => item.id === prior.id) ?? null : null); };

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [existing, serverConfig] = await Promise.all([api.listCases(), api.config()]);
        if (cancelled) return;
        setConfig(serverConfig);
        let available = existing;
        if (!available.length) {
          const seeded = await api.createCase({ title: "Operation Glass Harbor", description: "Synthetic relationship-investment scam demonstration", synthetic: true });
          const withEvidence = await api.addEvidence(seeded.case.id, { title: "Synthetic LumaChat conversation · 2026", rawText: syntheticConversation, sourceType: "pasted_text" });
          available = [withEvidence];
        }
        const primaryDemo = available.find((item) => item.case.synthetic && item.case.title === "Operation Glass Harbor");
        if (primaryDemo) available = await ensureComparisonDemoCases(available);
        if (!cancelled) {
          const active = primaryDemo ?? available[0];
          setCases(available); setCaseId(active.case.id); setActiveSourceId(active.evidence[0]?.id ?? "");
        }
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load the workspace."); }
    }
    bootstrap(); return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (current && !activeSourceId && current.evidence[0]) setActiveSourceId(current.evidence[0].id); }, [current, activeSourceId]);

  async function run(label: string, operation: () => Promise<CaseWorkspace>, success?: string) {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setBusy(label); setError(""); setNotice("");
    try { const next = await operation(); replaceCurrent(next); if (success) setNotice(success); return next; }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The operation failed."); }
    finally { operationInFlight.current = false; setBusy(""); }
  }

  function inspect(item: Inspectable) { setSelected(item); const citation = item.sources?.[0]; if (citation) { setHighlight(citation); setActiveSourceId(citation.evidenceSourceId); } }
  function openCitation(citation: SourceReference) { setHighlight(citation); setActiveSourceId(citation.evidenceSourceId); setView("evidence"); }
  function openCrossCitation(citation: SourceReference) {
    const owner = cases.find((item) => item.evidence.some((source) => source.id === citation.evidenceSourceId));
    if (owner) setCaseId(owner.case.id);
    setSelected(null); setHighlight(citation); setActiveSourceId(citation.evidenceSourceId); setView("evidence");
  }
  async function review(item: Inspectable, reviewStatus: ReviewStatus) {
    const kind = item.id.startsWith("coer-") ? "coercionSignals" : itemKind(item); if (kind === "relationships" || kind === "questions") return;
    await run("Saving review…", () => api.updateFinding(current.case.id, kind, item.id, { reviewStatus }), "Review decision saved.");
  }
  async function createCase() {
    const title = window.prompt("Case title"); if (!title?.trim()) return;
    setBusy("Creating case…");
    try { const next = await api.createCase({ title }); setCases((items) => [...items, next]); setCaseId(next.case.id); setView("dashboard"); setSelected(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create case."); }
    finally { setBusy(""); }
  }
  async function deleteCase() {
    if (!current || !window.confirm(`Delete “${current.case.title}” and its locally stored evidence? This cannot be undone.`)) return;
    setBusy("Deleting case…");
    try {
      await api.deleteCase(current.case.id);
      const remaining = cases.filter((item) => item.case.id !== current.case.id);
      if (remaining.length) { setCases(remaining); setCaseId(remaining[0].case.id); }
      else { const replacement = await api.createCase({ title: "Untitled investigation" }); setCases([replacement]); setCaseId(replacement.case.id); }
      setSelected(null); setView("dashboard");
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete case."); }
    finally { setBusy(""); }
  }

  async function createLinkedDemo() {
    setBusy("Preparing linked synthetic case…"); setError(""); setNotice("");
    try {
      const prepared = await ensureComparisonDemoCases(cases);
      const linked = prepared.find((item) => item.case.title === "Operation Paper Comet");
      setCases(prepared); setNotice("Synthetic comparison cases are ready. Exact and suggested matches are available for review.");
      return linked;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not prepare the linked case."); }
    finally { setBusy(""); }
  }

  function goToTutorialStep(nextIndex: number) {
    if (nextIndex >= tutorialSteps.length) { setTutorialStep(null); return; }
    const bounded = Math.max(0, nextIndex);
    setSelected(null);
    setShowEvidenceForm(false);
    setView(tutorialSteps[bounded].view);
    setTutorialStep(bounded);
  }

  if (!current) return <main className="loading"><div className="loom">EW</div><p>{error || "Opening investigation workspace…"}</p></main>;
  const unreviewed = [...current.entities, ...current.events, ...current.indicators, ...current.coercionSignals].filter((item) => item.reviewStatus === "unreviewed").length;
  const contentProps = { workspace: current, inspect, openCitation, setView, run, setShowEvidenceForm, config };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><i /><i /><i /></div><div><strong>EvidenceWeaver</strong><span>Investigation workspace</span></div></div>
      <div className="case-switcher" data-tour="case-switcher"><label>Active case</label><select value={current.case.id} onChange={(event) => { const next = cases.find((item) => item.case.id === event.target.value); setCaseId(event.target.value); setActiveSourceId(next?.evidence[0]?.id ?? ""); setHighlight(null); setSelected(null); setView("dashboard"); }}>{cases.map((item) => <option key={item.case.id} value={item.case.id}>{item.case.title}</option>)}</select><button className="text-button" onClick={createCase}>＋ New case</button></div>
      <nav>{nav.map((item) => <button key={item.id} data-tour={`nav-${item.id}`} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}{item.id === "entities" && current.entities.length > 0 && <em>{current.entities.length}</em>}{item.id === "evidence" && <em>{current.evidence.length}</em>}{item.id === "coercion" && current.coercionSignals.length > 0 && <em>{current.coercionSignals.length}</em>}{item.id === "questions" && current.questions.length > 0 && <em>{current.questions.length}</em>}</button>)}</nav>
      <div className="sidebar-foot"><button className="danger-link" onClick={deleteCase}>Delete case</button><span>Local prototype · v0.1</span></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div><div className="eyebrow">{current.case.synthetic ? "Synthetic demonstration case" : "Investigation case"}</div><h1>{current.case.title}</h1></div><div className="top-actions"><button className="secondary compact tutorial-trigger" onClick={() => goToTutorialStep(0)} aria-label="Open guided tutorial">? Tutorial</button><Badge tone={current.extraction?.stale ? "warning" : current.extraction?.mode === "openai" ? "live" : "neutral"}>{current.extraction?.stale ? "Re-extraction needed" : current.extraction ? `${current.extraction.mode === "openai" ? current.extraction.model : "Mock pipeline"}` : "Not extracted"}</Badge><button className="primary compact" data-tour="run-extraction" disabled={Boolean(busy) || !current.evidence.length} onClick={() => run("Weaving evidence…", () => api.extract(current.case.id), "Structured findings are ready for review.")}>{busy.includes("Weaving") ? "Weaving…" : "Run extraction"}</button></div></header>
      <div className="safety-banner"><span>Human verification required</span> EvidenceWeaver organizes submitted information and highlights possible patterns. It does not establish identity, criminal liability, or legal conclusions.</div>
      {(error || notice || busy) && <div className={`toast ${error ? "error" : ""}`}>{error || notice || busy}<button onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
      <section className="view-area" data-tour="workspace">
        {view === "dashboard" && <Dashboard {...contentProps} unreviewed={unreviewed} />}
        {view === "evidence" && <EvidenceView workspace={current} activeSourceId={activeSourceId} setActiveSourceId={setActiveSourceId} highlight={highlight} onAdd={() => setShowEvidenceForm(true)} />}
        {view === "entities" && <EntitiesView workspace={current} inspect={inspect} review={review} run={run} />}
        {view === "timeline" && <TimelineView workspace={current} inspect={inspect} />}
        {view === "map" && <GraphView workspace={current} inspect={inspect} />}
        {view === "linked" && <LinkedCasesView workspace={current} allCases={cases} createLinkedDemo={createLinkedDemo} openCitation={openCrossCitation} />}
        {view === "analysis" && <AnalysisView workspace={current} inspect={inspect} review={review} />}
        {view === "coercion" && <CoercionView workspace={current} inspect={inspect} review={review} />}
        {view === "questions" && <QuestionsView workspace={current} inspect={inspect} run={run} />}
        {view === "brief" && <BriefView workspace={current} openCitation={openCitation} run={run} />}
        {view === "custody" && <CustodyView workspace={current} config={config} />}
      </section>
    </main>
    <EvidencePanel workspace={current} selected={selected} close={() => setSelected(null)} openCitation={openCitation} review={review} run={run} />
    {showEvidenceForm && <EvidenceForm close={() => setShowEvidenceForm(false)} submit={async (input) => { const next = await run("Saving evidence…", () => api.addEvidence(current.case.id, input), "Evidence preserved in the case."); if (next) { setShowEvidenceForm(false); setActiveSourceId(next.evidence.at(-1)?.id ?? ""); setView("evidence"); } }} />}
    {tutorialStep !== null && <Tutorial stepIndex={tutorialStep} onBack={() => goToTutorialStep(tutorialStep - 1)} onClose={() => setTutorialStep(null)} onNext={() => goToTutorialStep(tutorialStep + 1)} />}
  </div>;
}

function Dashboard({ workspace, unreviewed, setView, setShowEvidenceForm, run, config }: { workspace: CaseWorkspace; unreviewed: number; setView: (view: View) => void; setShowEvidenceForm: (value: boolean) => void; run: (label: string, op: () => Promise<CaseWorkspace>, success?: string) => Promise<CaseWorkspace | undefined>; config: AppConfig | null; inspect: (item: Inspectable) => void; openCitation: (source: SourceReference) => void }) {
  const stats = [["Evidence sources", workspace.evidence.length, "▤"], ["Extracted entities", workspace.entities.length, "◎"], ["Timeline events", workspace.events.length, "◷"], ["Awaiting review", unreviewed, "◇"]];
  const extractionCurrent = Boolean(workspace.entities.length) && !workspace.extraction?.stale;
  return <div className="dashboard">
    <div className="hero-card"><div><Badge tone={workspace.case.synthetic ? "synthetic" : "neutral"}>{workspace.case.synthetic ? "100% fictional data" : "User-submitted data"}</Badge><h2>Turn scattered messages into<br /><em>traceable case structure.</em></h2><p>{workspace.case.description || "Add evidence, extract proposed facts, and verify every claim against its source."}</p><div className="hero-actions"><button className="primary" onClick={() => setShowEvidenceForm(true)}>＋ Add evidence</button><button className="secondary" disabled={!workspace.evidence.length} onClick={() => run("Weaving evidence…", () => api.extract(workspace.case.id), "Structured findings are ready for review.")}>Run structured extraction</button></div></div><div className="weave-visual" aria-hidden="true"><span /><span /><span /><span /><b>Evidence</b><b>Facts</b><b>Review</b></div></div>
    <div className="stats-grid">{stats.map(([label, value, icon]) => <div className="stat" key={String(label)}><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>)}</div>
    <div className="dashboard-grid"><div className="panel"><div className="panel-heading"><div><span className="kicker">Workflow</span><h3>Investigation readiness</h3></div><Badge tone={workspace.extraction?.stale ? "warning" : extractionCurrent ? "good" : "neutral"}>{workspace.extraction?.stale ? "Re-extraction needed" : extractionCurrent ? "Extraction complete" : "Ready to extract"}</Badge></div><div className="steps">{[
      ["1", "Evidence preserved", workspace.evidence.length ? `${workspace.evidence.length} source${workspace.evidence.length === 1 ? "" : "s"}, stored verbatim` : "Add pasted text or a .txt file", Boolean(workspace.evidence.length), "evidence"],
      ["2", "Proposed facts", workspace.extraction?.stale ? "New evidence was added; rerun extraction" : workspace.entities.length ? `${workspace.entities.length} entities and ${workspace.events.length} events` : "Run the staged extraction pipeline", extractionCurrent, "entities"],
      ["3", "Human review", workspace.entities.length ? `${unreviewed} findings still need a decision` : "Confirm, edit, or reject model proposals", unreviewed === 0 && workspace.entities.length > 0, "entities"],
      ["4", "Case brief", workspace.brief ? "Evidence-grounded brief generated" : "Generate after reviewing findings", Boolean(workspace.brief), "brief"],
    ].map(([number, label, description, done, target]) => <button className="step" key={String(number)} onClick={() => setView(target as View)}><span className={done ? "done" : ""}>{done ? "✓" : number}</span><div><strong>{label}</strong><small>{description}</small></div><i>›</i></button>)}</div></div>
    <div className="panel method-card"><span className="kicker">Processing mode</span><h3>{config?.extractionMode === "openai" ? "Live structured extraction" : "Deterministic demo pipeline"}</h3><p>{config?.extractionMode === "openai" ? `Server-side Responses API · ${config.model}. Raw evidence is sent only when you run extraction.` : "No evidence leaves this machine. The full review and citation workflow remains available for a reliable demo."}</p><div className="method-row"><span className="pulse" />{config?.extractionMode === "openai" ? (config.hasApiKey ? "API key configured server-side" : "API key required") : "Mock mode active"}</div><div className="separation"><span>Source evidence</span><i>→</i><span>Proposed facts</span><i>→</i><span>Reviewed record</span></div></div></div>
  </div>;
}

const EVIDENCE_PAGE_LINES = 500;

function EvidenceView({ workspace, activeSourceId, setActiveSourceId, highlight, onAdd }: { workspace: CaseWorkspace; activeSourceId: string; setActiveSourceId: (id: string) => void; highlight: SourceReference | null; onAdd: () => void }) {
  const source = workspace.evidence.find((item) => item.id === activeSourceId) ?? workspace.evidence[0];
  const highlightRef = useRef<HTMLDivElement>(null);
  const [visibleLineCount, setVisibleLineCount] = useState(EVIDENCE_PAGE_LINES);
  const lines = useMemo(() => {
    if (!source) return [];
    let start = 0;
    return source.rawText.split("\n").map((text) => {
      const line = { text, start, end: start + text.length };
      start = line.end + 1;
      return line;
    });
  }, [source]);
  const sourceStats = useMemo(() => new Map(workspace.evidence.map((item) => [item.id, { lines: (item.rawText.match(/\n/g)?.length ?? 0) + 1, kilobytes: Math.ceil(item.rawText.length / 1024) }])), [workspace.evidence]);
  const highlightRange = useMemo(() => {
    if (!source || !highlight || highlight.evidenceSourceId !== source.id) return null;
    const start = highlight.startCharacter ?? source.rawText.indexOf(highlight.excerpt);
    if (start < 0) return null;
    return { start, end: highlight.endCharacter ?? start + highlight.excerpt.length };
  }, [highlight, source]);
  const firstHighlightedLine = useMemo(() => highlightRange ? lines.findIndex((line) => line.start < highlightRange.end && line.end >= highlightRange.start) : -1, [highlightRange, lines]);
  useEffect(() => {
    const needed = firstHighlightedLine >= 0 ? Math.ceil((firstHighlightedLine + 1) / EVIDENCE_PAGE_LINES) * EVIDENCE_PAGE_LINES : EVIDENCE_PAGE_LINES;
    setVisibleLineCount(Math.max(EVIDENCE_PAGE_LINES, needed));
  }, [firstHighlightedLine, source?.id]);
  useEffect(() => {
    if (firstHighlightedLine >= 0 && firstHighlightedLine < visibleLineCount) requestAnimationFrame(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [firstHighlightedLine, visibleLineCount]);
  if (!source) return <Empty title="No evidence yet" body="Paste conversation text or add a .txt file. Raw source text is preserved exactly." action={<button className="primary" onClick={onAdd}>Add evidence</button>} />;
  const shownLines = lines.slice(0, visibleLineCount);
  return <div className="evidence-layout"><div className="source-list"><div className="panel-heading"><div><span className="kicker">Sources</span><h3>Case evidence</h3></div><button className="icon-button" onClick={onAdd}>＋</button></div>{workspace.evidence.map((item) => { const stats = sourceStats.get(item.id)!; return <button key={item.id} className={source.id === item.id ? "active" : ""} onClick={() => setActiveSourceId(item.id)}><span className="file-icon">TXT</span><div><strong>{item.title}</strong><small>{stats.lines} lines · {stats.kilobytes} KB</small></div></button>; })}</div><div className="document"><div className="document-head"><div><Badge tone="synthetic">{workspace.case.synthetic ? "Synthetic" : source.sourceType.replace("_", " ")}</Badge><h2>{source.title}</h2><p>SHA-256 {source.contentHash?.slice(0, 16)}… · Added {new Date(source.createdAt).toLocaleDateString()}</p></div><button className="secondary" onClick={onAdd}>＋ Add source</button></div><div className="transcript">{shownLines.map((line, index) => { const isHit = Boolean(highlightRange && line.start < highlightRange.end && line.end >= highlightRange.start); const match = line.text.match(/^\[([^\]]+)\]\s+([^:]+):\s*(.*)$/); return <div key={index} ref={isHit && index === firstHighlightedLine ? highlightRef : undefined} className={`message-row ${isHit ? "highlighted" : ""}`}><span className="line-number">{index + 1}</span>{match ? <><time>{new Date(match[1]).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time><strong>{match[2]}</strong><p>{match[3]}</p></> : <p className="raw-line">{line.text}</p>}</div>; })}{visibleLineCount < lines.length && <div className="load-evidence"><span>Showing {shownLines.length.toLocaleString()} of {lines.length.toLocaleString()} lines</span><button className="secondary compact" onClick={() => setVisibleLineCount((count) => Math.min(lines.length, count + EVIDENCE_PAGE_LINES))}>Load 500 more lines</button></div>}</div></div></div>;
}

function EntitiesView({ workspace, inspect, review, run }: { workspace: CaseWorkspace; inspect: (item: Inspectable) => void; review: (item: Inspectable, status: ReviewStatus) => void; run: (label: string, op: () => Promise<CaseWorkspace>, success?: string) => Promise<CaseWorkspace | undefined> }) {
  const [filter, setFilter] = useState("all");
  const shown = workspace.entities.filter((item) => filter === "all" || item.reviewStatus === filter);
  async function edit(entity: ExtractedEntity) { const value = window.prompt("Displayed value", entity.displayedValue); if (!value?.trim() || value === entity.displayedValue) return; await run("Saving edit…", () => api.updateFinding(workspace.case.id, "entities", entity.id, { displayedValue: value.trim(), normalizedValue: value.trim().toLowerCase(), reviewStatus: "edited" }), "Entity corrected and marked edited."); }
  if (!workspace.entities.length) return <Empty title="No proposed entities" body="Run extraction to identify people, aliases, accounts, wallets, domains, and organizations." />;
  return <div className="panel fill"><div className="panel-heading table-heading"><div><span className="kicker">Human review</span><h2>Extracted entities</h2><p>Model output is proposed—not permanent fact—until you review it.</p></div><div className="segmented">{["all", "unreviewed", "confirmed", "rejected"].map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{titleCase(value)}</button>)}</div></div><div className="table-wrap"><table><thead><tr><th>Type</th><th>Value & description</th><th>Confidence</th><th>Sources</th><th>Review status</th><th aria-label="Actions" /></tr></thead><tbody>{shown.map((entity) => <tr key={entity.id} className={entity.reviewStatus === "rejected" ? "rejected" : ""} onClick={() => inspect(entity)}><td><Badge tone={`entity-${entity.type}`}>{entityLabels[entity.type] ?? titleCase(entity.type)}</Badge></td><td><strong>{entity.displayedValue}</strong><small>{entity.description}</small></td><td><div className="meter"><i style={{ width: `${entity.confidence * 100}%` }} /></div><small>{confidence(entity.confidence)}</small></td><td><button className="citation-button" onClick={(event) => { event.stopPropagation(); inspect(entity); }}>▤ {entity.sources.length}</button></td><td><Badge tone={entity.reviewStatus}>{titleCase(entity.reviewStatus)}</Badge></td><td><div className="row-actions"><button title="Confirm" onClick={(event) => { event.stopPropagation(); review(entity, "confirmed"); }}>✓</button><button title="Edit" onClick={(event) => { event.stopPropagation(); edit(entity); }}>✎</button><button title="Reject" onClick={(event) => { event.stopPropagation(); review(entity, "rejected"); }}>×</button></div></td></tr>)}</tbody></table></div></div>;
}

function TimelineView({ workspace, inspect }: { workspace: CaseWorkspace; inspect: (item: Inspectable) => void }) {
  const visible = workspace.events.filter((item) => item.reviewStatus !== "rejected");
  const dated = visible.filter((item) => item.dateTime).sort((a, b) => a.dateTime!.localeCompare(b.dateTime!));
  const undated = visible.filter((item) => !item.dateTime);
  if (!workspace.events.length) return <Empty title="Timeline is waiting" body="Extract events from evidence to build a chronological, source-linked sequence." />;
  const render = (event: CaseEvent) => <button className="timeline-event" key={event.id} onClick={() => inspect(event)}><div className={`event-dot event-${event.eventType}`} /><div className="event-date">{event.dateTime ? <><strong>{new Date(event.dateTime).toLocaleDateString([], { month: "short", day: "numeric" })}</strong><small>{new Date(event.dateTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></> : <strong>—</strong>}</div><div className="event-card"><div><Badge tone={`event-${event.eventType}`}>{eventLabels[event.eventType]}</Badge><Badge tone={event.reviewStatus}>{titleCase(event.reviewStatus)}</Badge></div><h3>{event.description}</h3>{event.amount && <span className="amount">{event.amount.toLocaleString()} {event.currency}</span>}<footer><span>{confidence(event.confidence)} confidence</span><span>▤ {event.sources.length} citation{event.sources.length === 1 ? "" : "s"}</span></footer></div></button>;
  return <div className="timeline-view"><div className="view-heading"><div><span className="kicker">Chronology</span><h2>Evidence timeline</h2><p>Rejected events are excluded. Select any event to inspect the original message.</p></div><Badge tone="neutral">{dated.length} dated · {undated.length} undated</Badge></div><div className="timeline">{dated.map(render)}</div>{undated.length > 0 && <><h3 className="undated-title">Undated events</h3><div className="timeline undated">{undated.map(render)}</div></>}</div>;
}

function GraphView({ workspace, inspect }: { workspace: CaseWorkspace; inspect: (item: Inspectable) => void }) {
  const entities = useMemo(() => workspace.entities.filter((item) => item.reviewStatus !== "rejected"), [workspace.entities]);
  const entityMap = useMemo(() => new Map(entities.map((item) => [item.id, item])), [entities]);
  const relationships = useMemo(() => workspace.relationships.filter((edge) => entityMap.has(edge.sourceEntityId) && entityMap.has(edge.targetEntityId)), [entityMap, workspace.relationships]);
  const positions = useMemo(() => {
    const centerX = 440, centerY = 280, radiusX = 330, radiusY = 205;
    return new Map(entities.map((entity, index) => [entity.id, { x: centerX + Math.cos((index / Math.max(entities.length, 1)) * Math.PI * 2 - Math.PI / 2) * radiusX, y: centerY + Math.sin((index / Math.max(entities.length, 1)) * Math.PI * 2 - Math.PI / 2) * radiusY }]));
  }, [entities]);
  if (!entities.length) return <Empty title="No relationships to map" body="Run extraction to connect people, aliases, accounts, wallets, websites, and payment activity." />;
  return <div className="graph-view"><div className="view-heading"><div><span className="kicker">Relationship map</span><h2>Who and what connects?</h2><p>Every visible edge has at least one exact source excerpt.</p></div><Badge tone="good">{relationships.length} sourced connections</Badge></div><div className="graph-canvas"><svg viewBox="0 0 880 560" role="img" aria-label="Entity relationship graph"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#91a6a2" /></marker></defs>{relationships.map((edge) => { const from = positions.get(edge.sourceEntityId)!; const to = positions.get(edge.targetEntityId)!; const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2; return <g key={edge.id} className="graph-edge" onClick={() => inspect(edge)}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#arrow)" /><rect x={mx - 51} y={my - 11} width="102" height="22" rx="11" /><text x={mx} y={my + 4}>{edge.relationshipType.replaceAll("_", " ")}</text></g>; })}{entities.map((entity) => { const pos = positions.get(entity.id)!; return <g key={entity.id} className={`graph-node node-${entity.type}`} transform={`translate(${pos.x}, ${pos.y})`} onClick={() => inspect(entity)}><circle r="35" /><text className="node-icon" y="5">{["person", "alias"].includes(entity.type) ? "●" : entity.type === "crypto_wallet" ? "◈" : entity.type === "domain" ? "⌁" : "◆"}</text><rect x="-68" y="43" width="136" height="39" rx="8" /><text className="node-label" y="59"><tspan x="0">{entity.displayedValue.length > 20 ? `${entity.displayedValue.slice(0, 17)}…` : entity.displayedValue}</tspan><tspan x="0" dy="14" className="node-type">{entityLabels[entity.type]}</tspan></text></g>; })}</svg><div className="graph-legend"><span><i className="legend-person" />Person / alias</span><span><i className="legend-wallet" />Financial</span><span><i className="legend-digital" />Digital infrastructure</span><span><i className="legend-org" />Organization</span></div></div></div>;
}

function AnalysisView({ workspace, inspect, review }: { workspace: CaseWorkspace; inspect: (item: Inspectable) => void; review: (item: Inspectable, status: ReviewStatus) => void }) {
  if (!workspace.indicators.length) return <Empty title="No analytical indicators" body="Run extraction first. Analysis is built only from structured facts, never as an independent accusation." />;
  const observed = workspace.indicators.filter((item) => item.observed && item.reviewStatus !== "rejected");
  const hasStage = (number: number) => observed.some((item) => item.stageNumber === number);
  const patterns = [
    { label: "Relationship-investment progression", confidence: observed.length / 12, active: observed.length >= 6, note: `${observed.length} of 12 stages observed` },
    { label: "Fake crypto-investment platform", confidence: hasStage(5) && hasStage(9) ? .94 : .35, active: hasStage(5) && hasStage(9), note: "Investment introduction plus withdrawal obstruction" },
    { label: "Advance-fee withdrawal pattern", confidence: hasStage(9) && hasStage(10) ? .98 : .3, active: hasStage(9) && hasStage(10), note: "Blocked withdrawal followed by separate fee" },
  ];
  return <div className="analysis-view"><div className="view-heading"><div><span className="kicker">Analytical aid · not proof</span><h2>Observed pattern progression</h2><p>All 12 stages are shown; unsupported stages are explicitly marked not observed.</p></div><Badge tone="warning">Requires human review</Badge></div><div className="pattern-summary">{patterns.map((pattern) => <div key={pattern.label} className={pattern.active ? "active" : ""}><span>{pattern.active ? "Observed pattern" : "Insufficient support"}</span><strong>{pattern.label}</strong><p>{pattern.note}</p><footer><i style={{ width: `${pattern.confidence * 100}%` }} /><b>{confidence(pattern.confidence)}</b></footer></div>)}</div><div className="analysis-disclaimer"><strong>Interpretation is separated from fact.</strong> These indicators may be consistent with a known pattern, but they do not classify a person or establish that wrongdoing occurred.</div><div className="stage-list">{[...workspace.indicators].sort((a, b) => (a.stageNumber ?? 99) - (b.stageNumber ?? 99)).map((indicator) => <article key={indicator.id} className={`stage-card ${!indicator.observed ? "not-observed" : ""} ${indicator.reviewStatus === "rejected" ? "rejected" : ""}`} onClick={() => indicator.observed && inspect(indicator)}><div className="stage-number">{indicator.stageNumber ?? "•"}</div><div className="stage-body"><header><div><h3>{indicator.label.replace(/^\d+\s*·\s*/, "")}</h3><Badge tone={indicator.observed ? indicator.severity : "neutral"}>{indicator.observed ? `${indicator.severity} relevance` : "Not observed"}</Badge></div><div className="confidence-ring" style={{ "--score": `${indicator.confidence * 360}deg` } as React.CSSProperties}><span>{confidence(indicator.confidence)}</span></div></header><p>{indicator.explanation}</p><div className="alternatives"><div><strong>Alternative interpretation</strong><span>{indicator.alternativeExplanation}</span></div><div><strong>Missing evidence</strong><span>{indicator.missingEvidence}</span></div></div><footer>{indicator.observed ? <button onClick={(event) => { event.stopPropagation(); inspect(indicator); }}>▤ View supporting evidence</button> : <span>No supporting excerpt in submitted evidence</span>}<div>{indicator.observed && <button onClick={(event) => { event.stopPropagation(); review(indicator, "confirmed"); }}>Confirm indicator</button>}<button onClick={(event) => { event.stopPropagation(); review(indicator, "rejected"); }}>{indicator.observed ? "Not observed" : "Confirm absence"}</button></div></footer></div></article>)}</div></div>;
}

function LinkedCasesView({ workspace, allCases, createLinkedDemo, openCitation }: { workspace: CaseWorkspace; allCases: CaseWorkspace[]; createLinkedDemo: () => Promise<CaseWorkspace | undefined>; openCitation: (source: SourceReference) => void }) {
  const [matches, setMatches] = useState<CrossCaseMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [compareId, setCompareId] = useState("");
  const [linkError, setLinkError] = useState("");
  const refreshSequence = useRef(0);
  async function refresh() { const sequence = ++refreshSequence.current; setLoading(true); setLinkError(""); try { const next = await api.getLinks(workspace.case.id); if (sequence === refreshSequence.current) setMatches(next); } catch (caught) { if (sequence === refreshSequence.current) setLinkError(caught instanceof Error ? caught.message : "Could not load linked cases."); } finally { if (sequence === refreshSequence.current) setLoading(false); } }
  useEffect(() => { refresh(); return () => { refreshSequence.current += 1; }; }, [workspace.case.id, allCases.length]);
  async function prepare() { await createLinkedDemo(); await refresh(); }
  async function review(match: CrossCaseMatch, reviewStatus: "confirmed" | "rejected") { const sequence = ++refreshSequence.current; const next = await api.reviewLink(workspace.case.id, match.id, reviewStatus); if (sequence === refreshSequence.current) setMatches(next); }
  const visible = matches.filter((item) => item.reviewStatus !== "rejected");
  if (allCases.length < 2) return <Empty title="Add another case to reveal shared signals" body="Cross-case matching starts with reproducible exact identifiers, then adds clearly labeled script and behavior suggestions. Cases are never merged automatically." action={<button className="primary" onClick={prepare}>Prepare linked synthetic case</button>} />;
  return <div className="linked-view"><div className="view-heading"><div><span className="kicker">Cross-case intelligence</span><h2>Shared signals across cases</h2><p>Exact matches and inferred suggestions use separate visual treatment. Every link is reviewable.</p></div><div className="linked-actions"><Badge tone="good">{matches.filter((item) => item.exact).length} exact</Badge><Badge tone="warning">{matches.filter((item) => !item.exact).length} suggested</Badge><button className="secondary compact" onClick={refresh}>Refresh</button></div></div>{linkError && <div className="analysis-disclaimer">{linkError}</div>}{loading ? <div className="mini-loading">Comparing reviewed case structure…</div> : !visible.length ? <Empty title="No cross-case matches observed" body="No deterministic identifier or supported similarity currently connects this case to another case." /> : <div className="match-list">{visible.map((match) => { const expanded = compareId === match.id; const sources = match.sourceReferences.map((source) => { const owner = allCases.find((item) => item.evidence.some((evidence) => evidence.id === source.evidenceSourceId)); return { source, owner, evidence: owner?.evidence.find((item) => item.id === source.evidenceSourceId) }; }); return <article key={match.id} className={`match-card ${match.exact ? "exact" : "suggested"}`}><header><div><Badge tone={match.exact ? "good" : "warning"}>{match.exact ? "Exact match" : "Suggested similarity"}</Badge><Badge tone={match.reviewStatus}>{titleCase(match.reviewStatus)}</Badge><h3>{titleCase(match.matchType)}</h3><p>Related case: <strong>{match.relatedCaseTitle}</strong></p></div><div className="match-score"><strong>{confidence(match.confidence)}</strong><span>confidence</span></div></header><p>{match.description}</p><div className="matched-values">{match.matchedValues.slice(0, 6).map((value) => <code key={value}>{value.replaceAll("_", " ")}</code>)}</div><footer><button onClick={() => setCompareId(expanded ? "" : match.id)}>{expanded ? "Hide comparison" : "Compare side by side"}</button><div><button onClick={() => review(match, "confirmed")}>✓ Confirm link</button><button onClick={() => review(match, "rejected")}>× Reject</button></div></footer>{expanded && <div className="case-comparison">{sources.map(({ source, owner, evidence }, index) => <button key={`${source.evidenceSourceId}-${index}`} onClick={() => openCitation(source)}><span>{owner?.case.title ?? "Unknown case"}</span><strong>{evidence?.title ?? "Evidence source"}</strong><blockquote>“{source.excerpt}”</blockquote><em>Open exact passage ↗</em></button>)}</div>}</article>; })}</div>}<div className="link-safety"><strong>No automatic merging.</strong> An exact value match does not establish common ownership, identity, coordination, or criminal attribution. Suggested matches require additional verification.</div></div>;
}

function CoercionView({ workspace, inspect, review }: { workspace: CaseWorkspace; inspect: (item: Inspectable) => void; review: (item: Inspectable, status: ReviewStatus) => void }) {
  if (!workspace.extraction) return <Empty title="Run extraction to review possible coercion language" body="This separate analysis surfaces only directly quoted language that may warrant trained human review." />;
  if (!workspace.coercionSignals.length) return <div className="coercion-view"><div className="view-heading"><div><span className="kicker">Specialist review channel</span><h2>Potential coercion indicators</h2></div><Badge tone="good">None observed</Badge></div><Empty title="No supported coercion signal observed" body="The extraction found no directly supported language meeting the cautious signal threshold in this evidence." /></div>;
  return <div className="coercion-view"><div className="view-heading"><div><span className="kicker">Specialist review channel</span><h2>Potential coercion indicators</h2><p>These flags do not establish trafficking, victim status, or forced participation.</p></div><Badge tone="warning">{workspace.coercionSignals.length} require context</Badge></div><div className="coercion-warning"><strong>Especially cautious language required.</strong> Each signal includes a benign alternative and is presented for trained review—not as a classification.</div><div className="coercion-grid">{workspace.coercionSignals.map((signal) => <article key={signal.id} className={signal.reviewStatus === "rejected" ? "rejected" : ""} onClick={() => inspect(signal)}><header><Badge tone={signal.reviewPriority === "urgent" ? "high" : signal.reviewPriority === "elevated" ? "warning" : "neutral"}>{signal.reviewPriority} review</Badge><Badge tone={signal.reviewStatus}>{titleCase(signal.reviewStatus)}</Badge></header><h3>{signal.label}</h3><p>{signal.explanation}</p><dl><div><dt>Speaker</dt><dd>{signal.speaker ?? "Unknown"}</dd></div><div><dt>Confidence</dt><dd>{confidence(signal.confidence)}</dd></div><div><dt>Category</dt><dd>{titleCase(signal.category)}</dd></div></dl><div className="benign"><strong>Possible alternative explanation</strong><span>{signal.alternativeExplanation}</span></div><footer><button onClick={(event) => { event.stopPropagation(); inspect(signal); }}>▤ Inspect exact language</button><div><button onClick={(event) => { event.stopPropagation(); review(signal, "confirmed"); }}>Confirm for review</button><button onClick={(event) => { event.stopPropagation(); review(signal, "rejected"); }}>Dismiss</button></div></footer></article>)}</div><div className="link-safety">High-risk findings require trained specialist review. EvidenceWeaver does not recommend confronting participants or conducting unauthorized investigation.</div></div>;
}

function QuestionsView({ workspace, inspect, run }: { workspace: CaseWorkspace; inspect: (item: Inspectable) => void; run: (label: string, op: () => Promise<CaseWorkspace>, success?: string) => Promise<CaseWorkspace | undefined> }) {
  const questions = workspace.questions.filter((item) => item.status !== "dismissed");
  async function status(id: string, next: "answered" | "dismissed") { await run("Updating question…", () => api.updateQuestion(workspace.case.id, id, next), "Question status updated."); }
  if (!workspace.questions.length) return <Empty title="Generate prioritized next questions" body="Questions are prompted by the current structured evidence and explain why they matter, what would answer them, and which source triggered them." action={<button className="primary" disabled={!workspace.entities.length} onClick={() => run("Generating questions…", () => api.generateQuestions(workspace.case.id), "Prioritized investigative questions generated.")}>Generate next questions</button>} />;
  return <div className="questions-view"><div className="view-heading"><div><span className="kicker">Evidence-led next steps</span><h2>Prioritized investigative questions</h2><p>These are lawful verification questions—not instructions for hacking, surveillance, or identity exposure.</p></div><button className="secondary" onClick={() => run("Regenerating questions…", () => api.generateQuestions(workspace.case.id), "Questions refreshed from the current reviewed record.")}>Regenerate</button></div><div className="question-stats"><span><strong>{questions.filter((item) => item.priority === "high").length}</strong>High priority</span><span><strong>{questions.filter((item) => item.status === "answered").length}</strong>Answered</span><span><strong>{questions.filter((item) => item.status === "proposed").length}</strong>Open</span></div><div className="question-list">{questions.map((question, index) => <article key={question.id} className={question.status === "answered" ? "answered" : ""}><div className="question-rank">{String(index + 1).padStart(2, "0")}</div><div><header><Badge tone={question.priority === "high" ? "high" : question.priority === "medium" ? "warning" : "neutral"}>{question.priority} priority</Badge><Badge tone={question.status === "answered" ? "good" : "unreviewed"}>{titleCase(question.status)}</Badge></header><h3>{question.question}</h3><div className="question-details"><div><strong>Why it matters</strong><p>{question.whyItMatters}</p></div><div><strong>Prompted by</strong><p>{question.promptedBy}</p></div><div><strong>Information that would answer it</strong><p>{question.informationNeeded}</p></div></div><footer><button onClick={() => inspect(question)}>▤ {question.sources.length} evidence source{question.sources.length === 1 ? "" : "s"}</button><div><button onClick={() => status(question.id, "answered")}>✓ Mark answered</button><button onClick={() => status(question.id, "dismissed")}>Dismiss</button></div></footer></div></article>)}</div></div>;
}

function BriefView({ workspace, openCitation, run }: { workspace: CaseWorkspace; openCitation: (source: SourceReference) => void; run: (label: string, op: () => Promise<CaseWorkspace>, success?: string) => Promise<CaseWorkspace | undefined> }) {
  const brief = workspace.brief;
  async function copy() { if (!brief) return; const text = brief.sections.map((section) => `${section.title}\n\n${section.paragraphs.join("\n\n")}`).join("\n\n"); await navigator.clipboard.writeText(text); }
  if (!brief) return <Empty title="Generate an evidence-grounded brief" body="Rejected findings are excluded. Unreviewed findings are visibly marked, and factual sections carry source citations." action={<button className="primary" disabled={!workspace.entities.length} onClick={() => run("Generating brief…", () => api.generateBrief(workspace.case.id), "Case brief generated from the current reviewed record.")}>Generate case brief</button>} />;
  return <div className="brief-view"><div className="brief-toolbar"><div><span className="kicker">Generated {new Date(brief.generatedAt).toLocaleString()}</span><h2>Evidence-grounded case brief</h2></div><div><button className="secondary" onClick={copy}>Copy text</button><button className="secondary" onClick={() => window.print()}>Print</button><button className="primary" onClick={() => run("Regenerating brief…", () => api.generateBrief(workspace.case.id), "Brief refreshed from review decisions.")}>Regenerate</button></div></div><article className="report"><header><div className="report-mark">EW</div><div><span>EvidenceWeaver · Prototype report</span><h1>{workspace.case.title}</h1><p>{workspace.case.description}</p></div></header><div className="report-warning">{brief.disclaimer}</div>{brief.sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{section.citations.length > 0 && <div className="report-citations">{section.citations.map((citation, index) => <button key={`${citation.evidenceSourceId}-${citation.startCharacter}-${index}`} onClick={() => openCitation(citation)}><sup>{index + 1}</sup> {citation.excerpt.slice(0, 90)}{citation.excerpt.length > 90 ? "…" : ""}</button>)}</div>}</section>)}</article></div>;
}

function CustodyView({ workspace, config }: { workspace: CaseWorkspace; config: AppConfig | null }) {
  const [overview, setOverview] = useState<CustodyOverview | null>(null);
  const [custodyError, setCustodyError] = useState("");
  const [custodyBusy, setCustodyBusy] = useState("");

  async function refresh() {
    setCustodyBusy("Verifying custody chain…"); setCustodyError("");
    try { setOverview(await api.getCustody(workspace.case.id)); }
    catch (caught) { setCustodyError(caught instanceof Error ? caught.message : "Unable to verify the custody record."); }
    finally { setCustodyBusy(""); }
  }

  useEffect(() => { let cancelled = false; api.getCustody(workspace.case.id).then((next) => { if (!cancelled) setOverview(next); }).catch((caught) => { if (!cancelled) setCustodyError(caught instanceof Error ? caught.message : "Unable to load the custody record."); }); return () => { cancelled = true; }; }, [workspace.case.id, workspace.case.updatedAt]);

  async function addNote() {
    const purpose = window.prompt("Describe the custody action or reason for this note");
    if (!purpose?.trim()) return;
    setCustodyBusy("Recording custody note…"); setCustodyError("");
    try { setOverview(await api.recordCustodyEvent(workspace.case.id, { purpose: purpose.trim() })); }
    catch (caught) { setCustodyError(caught instanceof Error ? caught.message : "Unable to record the custody note."); }
    finally { setCustodyBusy(""); }
  }

  async function exportManifest() {
    setCustodyBusy("Preparing integrity manifest…"); setCustodyError("");
    try {
      const manifest = await api.getManifest(workspace.case.id);
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `${workspace.case.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "case"}-custody-manifest.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (caught) { setCustodyError(caught instanceof Error ? caught.message : "Unable to export the integrity manifest."); }
    finally { setCustodyBusy(""); }
  }

  const intact = Boolean(overview?.verification.valid && overview.allEvidenceIntact);
  return <div className="custody-view">
    <div className="view-heading"><div><span className="kicker">Integrity and accountability</span><h2>Evidence custody record</h2><p>Source hashes and append-only events document handling without changing original evidence.</p></div><div className="custody-actions"><Badge tone={intact ? "good" : "warning"}>{overview ? (intact ? "Integrity verified" : "Review required") : "Checking"}</Badge><button className="secondary compact" disabled={Boolean(custodyBusy)} onClick={refresh}>Verify</button><button className="secondary compact" disabled={Boolean(custodyBusy)} onClick={addNote}>＋ Custody note</button><button className="primary compact" disabled={Boolean(custodyBusy)} onClick={exportManifest}>Export manifest</button></div></div>
    {(custodyError || custodyBusy) && <div className={`analysis-disclaimer ${custodyError ? "custody-error" : ""}`}>{custodyError || custodyBusy}</div>}
    <div className="custody-summary">
      <article><span>Evidence integrity</span><strong>{overview?.allEvidenceIntact ? "All sources intact" : "Pending verification"}</strong><small>{overview?.evidence.length ?? 0} source hash{overview?.evidence.length === 1 ? "" : "es"} recalculated</small></article>
      <article><span>Ledger integrity</span><strong>{overview?.verification.valid ? "Hash chain intact" : "Verification pending"}</strong><small>{overview?.verification.recordCount ?? 0} total custody events</small></article>
      <article><span>Record authentication</span><strong>{overview?.verification.authenticated ? "HMAC authenticated" : "Hash chained"}</strong><small>{overview?.verification.authenticated ? "Server authenticator verified" : "Demo mode; production requires a managed key"}</small></article>
      <article><span>Active operator</span><strong>{config?.actor.displayName ?? "Loading"}</strong><small>{titleCase(config?.actor.role ?? "unknown")} · {config?.security.authentication ?? "unknown"}</small></article>
    </div>
    <div className="custody-columns">
      <section className="panel"><div className="panel-heading"><div><span className="kicker">Preserved sources</span><h3>Evidence fingerprints</h3></div><Badge tone={overview?.allEvidenceIntact ? "good" : "warning"}>{overview?.evidence.length ?? 0} verified</Badge></div><div className="fingerprint-list">{overview?.evidence.map((source) => <article key={source.id}><div><strong>{source.title}</strong><small>{source.byteLength.toLocaleString()} bytes · added {new Date(source.createdAt).toLocaleString()}</small></div><Badge tone={source.intact ? "good" : "high"}>{source.intact ? "Intact" : "Mismatch"}</Badge><code>SHA-256 {source.calculatedHash}</code></article>)}</div></section>
      <section className="panel"><div className="panel-heading"><div><span className="kicker">Append-only history</span><h3>Handling events</h3></div><Badge tone="neutral">{overview?.events.length ?? 0} for this case</Badge></div><div className="custody-event-list">{overview && overview.events.length ? [...overview.events].reverse().map((event) => <article key={event.recordHash}><span className="custody-sequence">#{event.sequence}</span><div><strong>{titleCase(event.action.replaceAll(".", "_"))}</strong><p>{event.purpose}</p><small>{event.actor.displayName} · {titleCase(event.actor.role)} · {new Date(event.timestamp).toLocaleString()}</small><code>{event.recordHash}</code></div></article>) : <div className="custody-empty">No handling event has been recorded for this case yet.</div>}</div></section>
    </div>
    <div className="custody-boundary"><strong>{config?.security.appMode === "production" ? "Production security profile active." : "Local demonstration profile."}</strong> {config?.security.appMode === "production" ? "External identity, encrypted storage, authenticated custody records, and HTTPS configuration passed startup checks." : "The ledger and evidence hashes are fully functional. Authentication, HMAC custody authentication, encrypted storage, and HTTPS are required automatically when production mode is enabled."}</div>
  </div>;
}

function EvidencePanel({ workspace, selected, close, openCitation, review, run }: { workspace: CaseWorkspace; selected: Inspectable | null; close: () => void; openCitation: (source: SourceReference) => void; review: (item: Inspectable, status: ReviewStatus) => void; run: (label: string, op: () => Promise<CaseWorkspace>, success?: string) => Promise<CaseWorkspace | undefined> }) {
  if (!selected) return null;
  const item = selected;
  const kind = itemKind(item);
  const reviewStatus = "reviewStatus" in item ? item.reviewStatus : null;
  async function edit() {
    if (!("displayedValue" in item) && !("eventType" in item)) return;
    const currentText = "displayedValue" in item ? item.displayedValue : item.description;
    const value = window.prompt(kind === "entities" ? "Correct displayed value" : "Correct event description", currentText); if (!value?.trim() || value === currentText) return;
    const patch = kind === "entities" ? { displayedValue: value.trim(), normalizedValue: value.trim().toLowerCase(), reviewStatus: "edited" as const } : { description: value.trim(), reviewStatus: "edited" as const };
    await run("Saving correction…", () => api.updateFinding(workspace.case.id, kind as "entities" | "events", item.id, patch), "Correction saved with original source unchanged.");
  }
  return <aside className="evidence-panel"><header><div><span className="kicker">Evidence behind this finding</span><h2>{itemTitle(selected)}</h2></div><button className="close-button" onClick={close}>×</button></header><div className="panel-meta"><div><span>Confidence</span><strong>{confidence(selected.confidence)}</strong></div><div><span>Status</span><Badge tone={reviewStatus ?? "neutral"}>{reviewStatus ? titleCase(reviewStatus) : "Proposed edge"}</Badge></div></div>{"description" in selected && selected.description && <div className="finding-description"><span>Proposed finding</span><p>{selected.description}</p></div>}{"explanation" in selected && <div className="finding-description"><span>Analytical interpretation</span><p>{selected.explanation}</p></div>}<div className="citations"><span className="kicker">Supporting source{selected.sources.length === 1 ? "" : "s"}</span>{selected.sources.map((citation, index) => { const source = workspace.evidence.find((item) => item.id === citation.evidenceSourceId); return <button key={index} onClick={() => openCitation(citation)}><div><span>Source {index + 1}</span><em>Open in evidence ↗</em></div><blockquote>“{citation.excerpt}”</blockquote><footer>{source?.title ?? "Unknown source"}<br />Message {citation.messageIndex ?? "—"} · characters {citation.startCharacter ?? "—"}–{citation.endCharacter ?? "—"}</footer></button>; })}</div>{reviewStatus && <footer className="review-controls"><span>Human review decision</span><div><button className="confirm" onClick={() => review(selected, "confirmed")}>✓ Confirm</button>{(kind === "entities" || kind === "events") && <button onClick={edit}>✎ Edit</button>}<button className="reject" onClick={() => review(selected, "rejected")}>× Reject</button></div><small>Review changes are stored separately. The source evidence is never altered.</small></footer>}</aside>;
}

function EvidenceForm({ close, submit }: { close: () => void; submit: (input: { title: string; rawText: string; sourceType: "pasted_text" | "text_file"; filename?: string }) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [rawText, setRawText] = useState(""); const [filename, setFilename] = useState(""); const [sourceType, setSourceType] = useState<"pasted_text" | "text_file">("pasted_text");
  async function file(event: React.ChangeEvent<HTMLInputElement>) { const selected = event.target.files?.[0]; if (!selected) return; if (!selected.name.toLowerCase().endsWith(".txt")) { event.target.value = ""; return; } setFilename(selected.name); setTitle(selected.name.replace(/\.txt$/i, "")); setRawText(await selected.text()); setSourceType("text_file"); }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><form className="modal" onSubmit={(event) => { event.preventDefault(); submit({ title: title || filename || "Pasted evidence", rawText, sourceType, filename: filename || undefined }); }}><header><div><span className="kicker">Preserve a new source</span><h2>Add evidence</h2><p>Raw text is stored verbatim. Extraction creates separate proposed findings.</p></div><button type="button" className="close-button" onClick={close}>×</button></header><label>Source title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. LumaChat export · April 2026" /></label><div className="or"><span>Paste text below</span><b>or</b><label className="file-button">Choose .txt file<input type="file" accept=".txt,text/plain" onChange={file} /></label></div><label>Evidence text<textarea value={rawText} onChange={(event) => { setRawText(event.target.value); if (sourceType === "text_file") { setSourceType("pasted_text"); setFilename(""); } }} placeholder="Paste conversation text exactly as received…" rows={15} required /></label><footer><span>{rawText ? `${rawText.split("\n").length} lines · ${rawText.length.toLocaleString()} characters` : "5 MB maximum"}</span><div><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={!rawText.trim()}>Preserve evidence</button></div></footer></form></div>;
}

export default App;
