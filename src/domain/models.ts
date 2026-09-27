export type EntityId = string;
export type ISODateTime = string;

export type AssessmentStatus =
  | "draft"
  | "searching"
  | "analysis"
  | "clinical_review"
  | "completed";

export type ReviewState = "ai_draft" | "reviewed" | "approved";

export type EvidenceState =
  | "evidence_based"
  | "ai_extracted"
  | "user_entered"
  | "estimated"
  | "not_available";

export type MissingDataReason =
  | "not_available"
  | "not_reported"
  | "insufficient_evidence"
  | "requires_clinical_review"
  | "requires_statistical_review"
  | "requires_cost_database";

export type SourceType =
  | "pubmed"
  | "clinicaltrials_gov"
  | "internal_benchmark"
  | "cro_cost_db"
  | "user_input"
  | "external_source";

export interface SourceReference {
  id: EntityId;
  type: SourceType;
  externalId?: string;
  label: string;
  url?: string;
  accessedAt?: ISODateTime;
}

export interface SourcedValue<T> {
  value: T | null;
  state: EvidenceState;
  missingReason?: MissingDataReason;
  basis?: string;
  sources: SourceReference[];
}

export interface AuditFields {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  createdBy: string;
  updatedBy: string;
}

export interface Candidate {
  id: EntityId;
  name: string;
  indication: string;
  mechanismOfAction?: string;
  target?: string;
  modality?: string;
  currentDevelopmentStage?: string;
  targetClinicalPhase: string;
  targetGeographies: string[];
}

export type RequestType =
  | "new_development"
  | "in_licensing"
  | "follow_up_study"
  | "indication_expansion"
  | "development_strategy_review"
  | "other";

export interface ResearchQuestion {
  id: EntityId;
  text: string;
  createdAt: ISODateTime;
}

export interface Assessment extends AuditFields {
  id: EntityId;
  candidate: Candidate;
  researchQuestion: ResearchQuestion;
  requestType: RequestType;
  requesterDepartment: string;
  requester: string;
  owner: string;
  status: AssessmentStatus;
  currentVersion: string;
  reviewStatus: ReviewState;
  clinicalTrialsSearchStrategy?: ClinicalTrialsServerSearchStrategy;
  selectedReferenceTrialIds: string[];
  selectedPublicationPmids: string[];
}

export type SearchSource =
  | "clinicaltrials"
  | "clinicaltrials_gov"
  | "pubmed";
export type ApiRequestStatus =
  | "idle"
  | "connected"
  | "loading"
  | "failed"
  | "no_results"
  | "rate_limited";

export interface SearchConcept {
  key:
    | "disease"
    | "drug"
    | "target"
    | "moa"
    | "treatment_line"
    | "clinical_trial"
    | "efficacy"
    | "safety"
    | "other";
  terms: string[];
}

export interface SearchStrategy {
  id: EntityId;
  assessmentId: EntityId;
  source: SearchSource;
  query: string;
  concepts: SearchConcept[];
  filters: Record<string, string | number | boolean | string[]>;
  updatedAt: ISODateTime;
  updatedBy: string;
}

export type ClinicalTrialPhase =
  | "EARLY_PHASE1"
  | "PHASE1"
  | "PHASE2"
  | "PHASE3"
  | "PHASE4"
  | "NA";

export type ClinicalTrialStudyType =
  | "INTERVENTIONAL"
  | "OBSERVATIONAL"
  | "EXPANDED_ACCESS";

export type ClinicalTrialStatus =
  | "NOT_YET_RECRUITING"
  | "RECRUITING"
  | "ENROLLING_BY_INVITATION"
  | "ACTIVE_NOT_RECRUITING"
  | "SUSPENDED"
  | "TERMINATED"
  | "COMPLETED"
  | "WITHDRAWN"
  | "UNKNOWN";

export type ClinicalTrialInterventionType =
  | "DRUG"
  | "BIOLOGICAL"
  | "DEVICE"
  | "PROCEDURE"
  | "RADIATION"
  | "BEHAVIORAL"
  | "DIETARY_SUPPLEMENT"
  | "GENETIC"
  | "COMBINATION_PRODUCT"
  | "DIAGNOSTIC_TEST"
  | "OTHER";

export type ClinicalTrialAgeGroup = "CHILD" | "ADULT" | "OLDER_ADULT";
export type ClinicalTrialSex = "FEMALE" | "MALE" | "ALL";

export interface ClinicalTrialsServerSearchStrategy {
  condition: string;
  phases: ClinicalTrialPhase[];
  studyTypes: ClinicalTrialStudyType[];
  statuses: ClinicalTrialStatus[];
  interventionTypes: ClinicalTrialInterventionType[];
  intervention: string;
  sponsor: string;
  country: string;
  ageGroups: ClinicalTrialAgeGroup[];
  sex: ClinicalTrialSex | "";
  startYear?: number;
  keyword: string;
}

export interface ClinicalTrialsLocalFilters {
  sponsor: string;
  intervention: string;
  country: string;
  endpoint: string;
  minEnrollment: string;
  maxEnrollment: string;
}

export interface ClinicalTrialsSearchStrategy {
  server: ClinicalTrialsServerSearchStrategy;
  local: ClinicalTrialsLocalFilters;
}

export type PublicationDatePreset =
  | "all"
  | "last_5_years"
  | "last_10_years"
  | "custom";

export interface PubMedSearchStrategy {
  category: EvidenceCategory;
  query: string;
  datePreset: PublicationDatePreset;
  customStartDate?: string;
  customEndDate?: string;
  publicationTypes: string[];
}

export interface SearchLog {
  id: EntityId;
  assessmentId: EntityId;
  source: SearchSource;
  searchType: string;
  query: string;
  structuredFilters: Record<
    string,
    string | number | boolean | string[] | null
  >;
  searchedAt: ISODateTime;
  matchedCount: number | null;
  retrievedCount: number;
  status: ApiRequestStatus;
  errorCode?: string;
  errorMessage?: string;
}

export interface OutcomeMeasure {
  measure: string;
  description?: string;
  timeFrame?: string;
}

export interface StudyDesign {
  allocation?: string;
  interventionModel?: string;
  masking?: string;
  primaryPurpose?: string;
  observationalModel?: string;
  timePerspective?: string;
}

export interface TrialLocation {
  facility?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface ClinicalTrialSummary {
  nctId: string;
  officialTitle?: string;
  briefTitle: string;
  sponsor?: string;
  studyType?: string;
  phases: string[];
  conditions: string[];
  interventions: string[];
  enrollment?: number;
  design: StudyDesign;
  primaryOutcomes: OutcomeMeasure[];
  secondaryOutcomes?: OutcomeMeasure[];
  countries: string[];
  overallStatus?: string;
  startDate?: string;
  source: SourceReference;
}

export interface ClinicalTrial extends ClinicalTrialSummary {
  collaborators: string[];
  secondaryOutcomes: OutcomeMeasure[];
  eligibilityCriteria?: string;
  sex?: string;
  minimumAge?: string;
  maximumAge?: string;
  locations: TrialLocation[];
  primaryCompletionDate?: string;
  studyCompletionDate?: string;
  lastUpdate?: string;
}

export type TrialReviewStatus = "unreviewed" | "reviewed";

export interface ClinicalTrialAssessmentState {
  assessmentId: EntityId;
  nctId: string;
  relevanceLevel: RelevanceLevel | null;
  relevanceReasons: string[];
  reviewStatus: TrialReviewStatus;
  isReferenceTrial: boolean;
}

export type EvidenceCategory =
  | "disease_landscape"
  | "historical_benchmark"
  | "target_moa"
  | "similar_drugs"
  | "study_design"
  | "safety";

export type PublicationReviewStatus =
  | "unreviewed"
  | "reviewed"
  | "included"
  | "excluded";

export type PublicationExclusionReason =
  | "not_relevant_population"
  | "wrong_indication"
  | "preclinical_only"
  | "case_report"
  | "insufficient_information"
  | "duplicate_evidence"
  | "other";

export interface Publication {
  pmid: string;
  title: string;
  authors: string[];
  journal?: string;
  publicationDate?: string;
  abstract?: string;
  publicationTypes: string[];
  meshTerms: string[];
  doi?: string;
  sourceUrl: string;
  selected: boolean;
  evidenceCategories: EvidenceCategory[];
  reviewStatus: PublicationReviewStatus;
  population?: string;
  lineOfTherapy?: string;
  treatment?: string;
  comparator?: string;
  sampleSize?: number;
  studyDesign?: string;
  primaryEndpoint?: string;
  secondaryEndpoints?: string[];
  efficacyResults?: string;
  safetyFindings?: string;
  source: SourceReference;
}

export type EvidenceExtractionStatus =
  | "not_extracted"
  | "extracting"
  | "extracted"
  | "not_connected"
  | "failed";

export type EvidenceFieldKey =
  | "population"
  | "line_of_therapy"
  | "treatment"
  | "comparator"
  | "sample_size"
  | "study_design"
  | "primary_endpoint"
  | "secondary_endpoints"
  | "orr"
  | "pfs"
  | "os"
  | "dor"
  | "hazard_ratio"
  | "confidence_interval"
  | "safety_findings"
  | "conclusion";

export type EvidenceFieldValue = string | number | string[];
export type EvidenceFieldReviewStatus =
  | "ai_draft"
  | "approved"
  | "rejected";

export interface ExtractedEvidenceField {
  id: EntityId;
  field: EvidenceFieldKey;
  originalAiValue: EvidenceFieldValue | null;
  originalAiUnit?: string;
  reviewedValue: EvidenceFieldValue | null;
  reviewedUnit?: string;
  pmid: string;
  sourceText: string;
  reviewStatus: EvidenceFieldReviewStatus;
  modified: boolean;
  reviewer?: string;
  reviewedAt?: ISODateTime;
}

export interface EvidenceExtractionIssue {
  field: EvidenceFieldKey;
  code: "SOURCE_MISMATCH";
  value: EvidenceFieldValue;
  unit?: string;
  sourceText: string;
}

export interface EvidenceExtraction {
  id: EntityId;
  assessmentId: EntityId;
  pmid: string;
  fields: ExtractedEvidenceField[];
  issues: EvidenceExtractionIssue[];
  extractionStatus: EvidenceExtractionStatus;
  provider?: string;
  model?: string;
  isMock: boolean;
  extractedAt?: ISODateTime;
  errorMessage?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type ExtractedEvidence = EvidenceExtraction;

export type ExtractionValidationResult =
  | "unreviewed"
  | "correct"
  | "incorrect"
  | "missed"
  | "unsupported"
  | "source_mismatch"
  | "not_reported_correct";

export type ExtractionValidationErrorType =
  | "VALUE_ERROR"
  | "UNIT_ERROR"
  | "POPULATION_ERROR"
  | "ENDPOINT_CLASSIFICATION_ERROR"
  | "SOURCE_MISMATCH"
  | "MISSED_VALUE"
  | "UNSUPPORTED_INFERENCE"
  | "OTHER";

export interface ExtractionGoldStandard {
  id: EntityId;
  assessmentId: EntityId;
  pmid: string;
  isMock: boolean;
  field: EvidenceFieldKey;
  aiValue: EvidenceFieldValue | null;
  aiUnit?: string;
  aiSourceText?: string;
  humanValue: EvidenceFieldValue | null;
  humanUnit?: string;
  humanSourceText?: string;
  result: ExtractionValidationResult;
  errorType?: ExtractionValidationErrorType;
  reviewer: string;
  reviewedAt: ISODateTime;
}

export type RelevanceLevel = "high" | "medium" | "low";

export type RelevanceDimension =
  | "indication"
  | "population"
  | "treatment_line"
  | "phase"
  | "moa_target"
  | "study_design"
  | "endpoint"
  | "geography";

export interface RelevanceReason {
  dimension: RelevanceDimension;
  matched: boolean | null;
  reason: string;
  sources: SourceReference[];
}

export interface ReferenceTrial {
  id: EntityId;
  assessmentId: EntityId;
  nctId: string;
  relevance: RelevanceLevel;
  reasons: RelevanceReason[];
  selectedBy: string;
  selectedAt: ISODateTime;
}

export interface SelectedPublication {
  id: EntityId;
  assessmentId: EntityId;
  pmid: string;
  relevance: RelevanceLevel;
  reasons: string[];
  selectedBy: string;
  selectedAt: ISODateTime;
}

export type BenchmarkMetricType =
  | "RESPONSE_RATE"
  | "CONTINUOUS_CHANGE"
  | "TIME_TO_EVENT"
  | "BINARY_ENDPOINT"
  | "SAFETY"
  | "OTHER";

export type BenchmarkEndpointType =
  | "PRIMARY"
  | "SECONDARY"
  | "EXPLORATORY"
  | "UNKNOWN";

export type BenchmarkMetricSourceType =
  | "reference_trial"
  | "approved_evidence"
  | "user_defined";

export type BenchmarkMetricSelectionStatus =
  | "candidate"
  | "selected"
  | "excluded";

export interface BenchmarkMetric {
  metricId: string;
  metricName: string;
  displayName: string;
  metricType: BenchmarkMetricType;
  value?: string | number | null;
  unit?: string | null;
  timepoint: string | null;
  population?: string | null;
  endpointType: BenchmarkEndpointType;
  sourceEvidenceIds: EntityId[];
  includedStudies: string[];
  status: BenchmarkMetricSelectionStatus;
  sourceType: BenchmarkMetricSourceType;
  createdBy?: string;
  createdAt?: ISODateTime;
}

export type BenchmarkDecision = "pending" | "included" | "excluded";
export type BenchmarkExclusionReason =
  | "different_population"
  | "different_line_of_therapy"
  | "different_treatment_setting"
  | "different_endpoint_definition"
  | "different_study_design"
  | "other";
export type BenchmarkStatus = "draft" | "approved";

export interface BenchmarkMetricObservation {
  observationId: EntityId;
  metricId: string;
  metricName: string;
  displayName: string;
  metricType: BenchmarkMetricType;
  value: string | number | null;
  unit: string | null;
  timepoint: string | null;
  population: string | null;
  endpointType: BenchmarkEndpointType;
  sourceType: BenchmarkMetricSourceType;
  sourceEvidenceId?: EntityId;
  sourceLabel: string;
  studyLabel: string;
  pmid?: string;
  nctId?: string;
  sourceText?: string;
  lineOfTherapy?: string | null;
  treatment?: string | null;
  sampleSize?: number | null;
}

export interface BenchmarkEvidenceDecision {
  observationId: EntityId;
  metricId: string;
  decision: BenchmarkDecision;
  exclusionReason?: BenchmarkExclusionReason;
  decidedBy?: string;
  decidedAt?: ISODateTime;
}

export interface BenchmarkMetricSummary {
  metricId: string;
  metricName: string;
  displayName: string;
  metricType: BenchmarkMetricType;
  timepoint: string | null;
  populations: string[];
  includedEvidenceIds: EntityId[];
  excludedEvidenceIds: EntityId[];
  observedRange: string | null;
  studyCount: number;
  totalN: number | null;
  unit: string | null;
}

export interface HistoricalBenchmark {
  id: EntityId;
  assessmentId: EntityId;
  metrics: BenchmarkMetric[];
  decisions: BenchmarkEvidenceDecision[];
  summaries: BenchmarkMetricSummary[];
  status: BenchmarkStatus;
  reviewer?: string;
  reviewedAt?: ISODateTime;
  isMock: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type StrategySourceType =
  | "assessment_input"
  | "reference_trial"
  | "approved_evidence"
  | "approved_benchmark"
  | "user_input"
  | "rule"
  | "ai_draft";

export type DevelopmentStrategyFieldKey =
  | "target_phase"
  | "target_population"
  | "line_of_therapy"
  | "study_design"
  | "control_comparator"
  | "primary_endpoint"
  | "secondary_endpoints"
  | "treatment_duration"
  | "target_geography"
  | "target_effect"
  | "historical_benchmark"
  | "sample_size"
  | "key_assumptions";

export type StrategyFieldReviewStatus = "draft" | "accepted" | "rejected";
export type DevelopmentStrategyStatus = "draft" | "reviewed" | "approved";

export interface StrategyTraceReference {
  id: EntityId;
  type: StrategySourceType;
  label: string;
  href?: string;
  pmid?: string;
  nctId?: string;
  sourceText?: string;
  isMock?: boolean;
}

export interface DevelopmentStrategyField {
  key: DevelopmentStrategyFieldKey;
  originalSuggestedValue: string | null;
  reviewedValue: string | null;
  basis: string;
  sourceType: StrategySourceType;
  sources: StrategyTraceReference[];
  reviewStatus: StrategyFieldReviewStatus;
  modified: boolean;
  reviewer?: string;
  reviewedAt?: ISODateTime;
}

export interface DevelopmentStrategy {
  id: EntityId;
  assessmentId: EntityId;
  fields: DevelopmentStrategyField[];
  status: DevelopmentStrategyStatus;
  reviewer?: string;
  reviewedAt?: ISODateTime;
  approvedAt?: ISODateTime;
  isMockEvidenceUsed: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface StrategyField<T> extends SourcedValue<T> {
  reviewStatus: ReviewState;
}

export type EngineStatus = "not_connected" | "ready" | "completed" | "failed";

export interface StatisticalDesign {
  id: EntityId;
  assessmentId: EntityId;
  objective: StrategyField<string>;
  primaryEndpoint: StrategyField<string>;
  historicalBenchmark: StrategyField<string>;
  expectedTreatmentEffect: StrategyField<string>;
  alpha: StrategyField<string>;
  power: StrategyField<string>;
  designCandidate: StrategyField<string>;
  sampleSize: StrategyField<number>;
  statisticalMethod: StrategyField<string>;
  engineStatus: EngineStatus;
  reviewStatus: ReviewState;
}

export type ConfidenceLevel = "low" | "medium" | "high";

export interface TimelineActivity {
  id: EntityId;
  name: string;
  estimatedDuration: SourcedValue<string>;
  confidence: ConfidenceLevel;
}

export interface TimelineEstimate {
  id: EntityId;
  assessmentId: EntityId;
  activities: TimelineActivity[];
  totalDuration: SourcedValue<string>;
  reviewStatus: ReviewState;
}

export interface MoneyRange {
  currency: string;
  low: number;
  base: number;
  high: number;
}

export interface CostAssumptions {
  countries: string[];
  phase?: string;
  siteCount?: number;
  patientCount?: number;
  studyDurationMonths?: number;
}

export interface CostEstimate {
  id: EntityId;
  assessmentId: EntityId;
  assumptions: CostAssumptions;
  siteCost: SourcedValue<MoneyRange>;
  monitoring: SourcedValue<MoneyRange>;
  projectManagement: SourcedValue<MoneyRange>;
  dataManagement: SourcedValue<MoneyRange>;
  statistics: SourcedValue<MoneyRange>;
  medicalWriting: SourcedValue<MoneyRange>;
  centralLab: SourcedValue<MoneyRange>;
  pharmacokinetics: SourcedValue<MoneyRange>;
  imaging: SourcedValue<MoneyRange>;
  other: SourcedValue<MoneyRange>;
  total: SourcedValue<MoneyRange>;
  engineStatus: EngineStatus;
  reviewStatus: ReviewState;
}

export type ComplexityLevel = "low" | "medium" | "high";

export type ComplexityDimension =
  | "recruitment"
  | "competition"
  | "operational"
  | "endpoint"
  | "regulatory"
  | "statistical"
  | "country_site";

export interface ComplexityItem {
  dimension: ComplexityDimension;
  level: ComplexityLevel;
  reason: string;
  sources: SourceReference[];
  reviewStatus: ReviewState;
}

export interface ComplexityAssessment {
  id: EntityId;
  assessmentId: EntityId;
  items: ComplexityItem[];
}

export interface Risk {
  id: EntityId;
  assessmentId: EntityId;
  title: string;
  description: string;
  sources: SourceReference[];
  reviewStatus: ReviewState;
}

export interface DecisionPoint {
  id: EntityId;
  assessmentId: EntityId;
  title: string;
  question: string;
  uncertainty?: string;
  sources: SourceReference[];
  reviewStatus: ReviewState;
}

export interface AssessmentVersion {
  id: EntityId;
  assessmentId: EntityId;
  version: string;
  label: string;
  changedAt: ISODateTime;
  changedBy: string;
  reviewStatus: ReviewState;
  changeSummary: string;
}

export interface Review {
  id: EntityId;
  assessmentId: EntityId;
  section:
    | "development_strategy"
    | "statistical_design"
    | "cost"
    | "timeline"
    | "key_risks"
    | "decision_points";
  status: ReviewState;
  reviewer?: string;
  comment?: string;
  reviewedAt?: ISODateTime;
}
