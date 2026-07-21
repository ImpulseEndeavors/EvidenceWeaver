import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { View } from "./App";

export interface TutorialStep {
  view: View;
  target: string;
  eyebrow: string;
  title: string;
  body: string;
  tip: string;
}

export const tutorialSteps: TutorialStep[] = [
  {
    view: "dashboard",
    target: "workspace",
    eyebrow: "Welcome to EvidenceWeaver",
    title: "Move from source evidence to a reviewable brief",
    body: "This tour follows the recommended investigation workflow. It changes only what you are viewing; it never edits evidence or runs an analysis for you.",
    tip: "Begin with the overview whenever you need to see what is complete and what still needs human review.",
  },
  {
    view: "dashboard",
    target: "case-switcher",
    eyebrow: "Keep work separated",
    title: "One workspace per investigation",
    body: "Use the case switcher to create or move between investigations. Evidence, findings, review decisions, and briefs stay within their case.",
    tip: "Use specific, non-sensitive case titles and avoid combining unrelated reports prematurely.",
  },
  {
    view: "evidence",
    target: "nav-evidence",
    eyebrow: "Step 1 · Preserve sources",
    title: "Add the original text before interpreting it",
    body: "Evidence accepts pasted text and plain-text files. The source remains verbatim while extracted findings are stored separately with exact citations.",
    tip: "Preserve timestamps, speaker labels, and original wording. Add separate sources instead of rewriting or summarizing them first.",
  },
  {
    view: "dashboard",
    target: "run-extraction",
    eyebrow: "Step 2 · Structure evidence",
    title: "Run extraction only when the source set is ready",
    body: "Extraction proposes entities, events, relationships, pattern indicators, and cautious coercion signals. Live mode sends submitted evidence to the configured OpenAI model when you click this button.",
    tip: "Treat every output as a proposal. A confidence score is not proof and never replaces source review.",
  },
  {
    view: "entities",
    target: "nav-entities",
    eyebrow: "Step 3 · Verify findings",
    title: "Confirm, correct, or reject proposed entities",
    body: "Open any row to inspect its supporting excerpt. Review decisions are stored separately, so corrections never alter the original evidence.",
    tip: "Check identifiers character by character. Reject unsupported findings rather than keeping them because they seem plausible.",
  },
  {
    view: "timeline",
    target: "nav-timeline",
    eyebrow: "Understand sequence and connections",
    title: "Use Timeline and Relationship map together",
    body: "Timeline orders proposed events; Relationship map shows how reviewed people, accounts, organizations, and infrastructure connect. Selecting an item reveals its evidence.",
    tip: "Look for gaps and contradictions as carefully as patterns. A graph edge indicates a cited association, not ownership or identity.",
  },
  {
    view: "analysis",
    target: "nav-analysis",
    eyebrow: "Interpret cautiously",
    title: "Separate observed facts from analytical patterns",
    body: "Pattern analysis shows supported and unsupported stages. Coercion signals use an even more cautious review channel and always include a possible benign explanation.",
    tip: "Use these views to prioritize specialist review, never to classify a person or establish wrongdoing.",
  },
  {
    view: "linked",
    target: "nav-linked",
    eyebrow: "Compare without merging",
    title: "Review exact and suggested cross-case links separately",
    body: "Linked cases distinguishes deterministic identifier matches from script or behavior similarities. Every connection remains reviewable and cases are never merged automatically.",
    tip: "An exact shared value is a lead to verify—not evidence of common ownership, coordination, or identity.",
  },
  {
    view: "questions",
    target: "nav-questions",
    eyebrow: "Plan lawful next steps",
    title: "Generate evidence-led investigator questions",
    body: "Next questions explain why each gap matters, what prompted it, and what information could answer it. You can mark questions answered or dismiss them.",
    tip: "Use questions to guide authorized verification. Do not use them as instructions for surveillance, hacking, or identity exposure.",
  },
  {
    view: "brief",
    target: "nav-brief",
    eyebrow: "Finish with traceability",
    title: "Generate the brief after reviewing findings",
    body: "The case brief excludes rejected findings, labels unreviewed material, and links factual sections back to exact evidence excerpts for rapid verification.",
    tip: "Resolve high-impact findings first, then regenerate the brief whenever review decisions change.",
  },
  {
    view: "custody",
    target: "nav-custody",
    eyebrow: "Verify preservation",
    title: "Inspect the evidence custody record",
    body: "Custody record recalculates every source hash, verifies the append-only handling chain, identifies the responsible operator, and exports a portable integrity manifest.",
    tip: "A technical manifest supports verification, but formal admissibility also depends on documented organizational procedures and qualified legal review.",
  },
];

interface TutorialProps {
  stepIndex: number;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
}

interface SpotlightRect { top: number; left: number; width: number; height: number }

export function Tutorial({ stepIndex, onBack, onClose, onNext }: TutorialProps) {
  const step = tutorialSteps[stepIndex];
  const cardRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => previousFocus.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const update = (scrollTarget = false) => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!target) { setRect(null); return; }
      if (scrollTarget) target.scrollIntoView({ block: "nearest", inline: "nearest" });
      const bounds = target.getBoundingClientRect();
      const padding = 7;
      const top = Math.max(6, bounds.top - padding);
      const left = Math.max(6, bounds.left - padding);
      setRect({
        top,
        left,
        width: Math.min(window.innerWidth - left - 6, bounds.width + padding * 2),
        height: Math.min(window.innerHeight - top - 6, bounds.height + padding * 2),
      });
      if (scrollTarget) cardRef.current?.focus();
    };
    const frame = requestAnimationFrame(() => update(true));
    const updatePosition = () => update(false);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [step.target, stepIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && stepIndex > 0) onBack();
      if (event.key === "ArrowRight") onNext();
      if (event.key === "Tab" && cardRef.current) {
        const focusable = [...cardRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) { event.preventDefault(); cardRef.current.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack, onClose, onNext, stepIndex]);

  const isLast = stepIndex === tutorialSteps.length - 1;
  return <>
    <button className={`tutorial-dismiss-layer ${rect ? "" : "dimmed"}`} aria-label="Close tutorial" onClick={onClose} />
    {rect && <div className="tutorial-spotlight" style={rect} aria-hidden="true" />}
    <section className="tutorial-card" ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-body" tabIndex={-1}>
      <header>
        <div><span>Guided tutorial</span><strong>{stepIndex + 1} of {tutorialSteps.length}</strong></div>
        <button onClick={onClose} aria-label="Close tutorial">×</button>
      </header>
      <div className="tutorial-progress" aria-label={`Tutorial progress: step ${stepIndex + 1} of ${tutorialSteps.length}`}>
        {tutorialSteps.map((item, index) => <i key={item.title} className={index <= stepIndex ? "complete" : ""} />)}
      </div>
      <div className="tutorial-copy">
        <span className="kicker">{step.eyebrow}</span>
        <h2 id="tutorial-title">{step.title}</h2>
        <p id="tutorial-body">{step.body}</p>
        <div className="tutorial-tip"><strong>Best practice</strong><span>{step.tip}</span></div>
      </div>
      <footer>
        <button className="text-button" onClick={onClose}>Exit tutorial</button>
        <div>
          <button className="secondary compact" disabled={stepIndex === 0} onClick={onBack}>Back</button>
          <button className="primary compact" onClick={onNext}>{isLast ? "Finish" : "Next"}</button>
        </div>
      </footer>
      <small className="tutorial-keys">Use ← → to move · Esc to exit</small>
    </section>
  </>;
}
