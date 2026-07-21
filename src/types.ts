export type ReviewStatus = "unreviewed" | "confirmed" | "rejected" | "edited";

export interface CaseRecord {
  id: string;
  title: string;
  description?: string;
  status: "open" | "review" | "closed";
  createdAt: string;
  updatedAt: string;
  synthetic?: boolean;
}

export interface EvidenceSource {
  id: string;
  caseId: string;
  filename?: string;
  sourceType: "pasted_text" | "text_file";
  title: string;
  rawText: string;
  createdAt: string;
  contentHash?: string;
}

export interface SourceReference {
  evidenceSourceId: string;
  startCharacter?: number;
  endCharacter?: number;
  messageIndex?: number;
  excerpt: string;
}

export type EntityType = "person" | "alias" | "organization" | "phone" | "email" | "social_account" | "messaging_account" | "crypto_wallet" | "bank_account" | "crypto_exchange" | "website" | "domain" | "ip_address" | "physical_location" | "company" | "currency" | "other";

export interface ExtractedEntity {
  id: string;
  caseId: string;
  type: EntityType;
  normalizedValue: string;
  displayedValue: string;
  description?: string;
  confidence: number;
  reviewStatus: ReviewStatus;
  sources: SourceReference[];
}

export type EventType = "initial_contact" | "platform_change" | "relationship_development" | "investment_introduction" | "account_creation" | "money_request" | "transfer" | "reported_profit" | "withdrawal_attempt" | "withdrawal_blocked" | "fee_demand" | "threat" | "communication" | "other";

export interface CaseEvent {
  id: string;
  caseId: string;
  eventType: EventType;
  dateTime?: string;
  approximateDate?: string;
  description: string;
  entityIds: string[];
  amount?: number;
  currency?: string;
  confidence: number;
  reviewStatus: ReviewStatus;
  sources: SourceReference[];
}

export interface EntityRelationship {
  id: string;
  caseId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: "communicated_with" | "used_alias" | "controlled_account" | "sent_funds_to" | "received_funds_from" | "associated_with" | "directed_to" | "mentioned" | "unknown";
  description?: string;
  confidence: number;
  sources: SourceReference[];
}

export interface AnalyticalIndicator {
  id: string;
  caseId: string;
  category: string;
  label: string;
  explanation: string;
  confidence: number;
  severity: "low" | "moderate" | "high";
  supportingEntityIds: string[];
  supportingEventIds: string[];
  sources: SourceReference[];
  reviewStatus: Exclude<ReviewStatus, "edited">;
  observed: boolean;
  stageNumber?: number;
  alternativeExplanation?: string;
  missingEvidence?: string;
}

export interface CoercionSignal {
  id: string;
  caseId: string;
  category: "restricted_movement" | "confiscated_documents" | "debt_or_recruitment_fees" | "threats_of_violence" | "work_quotas" | "punishment" | "guarded_compound" | "communication_surveillance" | "request_for_rescue" | "unable_to_leave" | "forced_participation" | "withheld_pay" | "false_employment" | "cross_border_transport" | "location_secrecy" | "other";
  label: string;
  explanation: string;
  speaker?: string;
  dateTime?: string;
  confidence: number;
  alternativeExplanation: string;
  reviewPriority: "routine" | "elevated" | "urgent";
  relatedEntityIds: string[];
  sources: SourceReference[];
  reviewStatus: Exclude<ReviewStatus, "edited">;
}

export interface InvestigatorQuestion {
  id: string;
  caseId: string;
  question: string;
  whyItMatters: string;
  promptedBy: string;
  informationNeeded: string;
  priority: "low" | "medium" | "high";
  confidence: number;
  supportingEntityIds: string[];
  supportingEventIds: string[];
  sources: SourceReference[];
  status: "proposed" | "answered" | "dismissed";
}

export interface CrossCaseMatch {
  id: string;
  caseIds: string[];
  relatedCaseId: string;
  relatedCaseTitle: string;
  matchType: "exact_entity" | "similar_entity" | "shared_script" | "shared_infrastructure" | "behavioral_similarity";
  description: string;
  confidence: number;
  matchedValues: string[];
  sourceReferences: SourceReference[];
  exact: boolean;
  reviewStatus: "unreviewed" | "confirmed" | "rejected";
}

export interface BriefSection { title: string; paragraphs: string[]; citations: SourceReference[]; }
export interface CaseBrief { generatedAt: string; sections: BriefSection[]; disclaimer: string; }

export interface SecurityStatus {
  appMode: "demo" | "production";
  authentication: string;
  authorization: string;
  encryptedAtRest: boolean;
  custodyLedger: boolean;
  custodyAuthenticated: boolean;
  secureTransportRequired: boolean;
  productionReady: boolean;
}

export interface AppConfig {
  extractionMode: "mock" | "openai";
  model: string;
  hasApiKey: boolean;
  security: SecurityStatus;
  actor: { displayName: string; role: string };
}

export interface CustodyRecord {
  version: number;
  sequence: number;
  timestamp: string;
  actor: { id: string; displayName: string; role: string; authenticationMethod: string };
  action: string;
  caseId: string | null;
  evidenceSourceId: string | null;
  purpose: string;
  details: Record<string, unknown>;
  previousHash: string | null;
  recordHash: string;
  authenticator: string | null;
}

export interface CustodyOverview {
  verification: { valid: boolean; recordCount: number; headHash: string | null; authenticated: boolean; errors: string[] };
  events: CustodyRecord[];
  evidence: Array<{ id: string; title: string; sourceType: string; createdAt: string; byteLength: number; recordedHash: string | null; calculatedHash: string; intact: boolean }>;
  allEvidenceIntact: boolean;
}

export interface CustodyManifest {
  format: string;
  version: number;
  generatedAt: string;
  case: { id: string; title: string; createdAt: string; updatedAt: string };
  evidence: CustodyOverview["evidence"];
  custody: { verification: CustodyOverview["verification"]; events: CustodyRecord[] };
  disclaimer: string;
  manifestHash: string;
}

export interface CaseWorkspace {
  case: CaseRecord;
  evidence: EvidenceSource[];
  entities: ExtractedEntity[];
  events: CaseEvent[];
  relationships: EntityRelationship[];
  indicators: AnalyticalIndicator[];
  coercionSignals: CoercionSignal[];
  questions: InvestigatorQuestion[];
  brief?: CaseBrief;
  extraction?: { mode: "mock" | "openai"; model?: string; completedAt: string; warnings: string[]; stale?: boolean };
}

export type Inspectable = ExtractedEntity | CaseEvent | EntityRelationship | AnalyticalIndicator | CoercionSignal | InvestigatorQuestion;
