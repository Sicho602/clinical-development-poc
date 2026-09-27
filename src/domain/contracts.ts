import type {
  Assessment,
  AssessmentVersion,
  ClinicalTrial,
  ClinicalTrialsServerSearchStrategy,
  DevelopmentStrategy,
  ExtractedEvidence,
  HistoricalBenchmark,
  Publication,
  ReferenceTrial,
  SearchLog,
  SearchStrategy,
  SelectedPublication,
} from "@/domain/models";

export interface PageRequest {
  pageSize: number;
  pageToken?: string;
}

export interface PageResult<T> {
  items: T[];
  totalCount?: number;
  nextPageToken?: string;
}

export interface AssessmentFilters {
  candidate?: string;
  indication?: string;
  phase?: string;
  status?: Assessment["status"];
  owner?: string;
}

export interface AssessmentRepository {
  create(assessment: Assessment): Promise<Assessment>;
  getById(id: string): Promise<Assessment | null>;
  list(filters?: AssessmentFilters): Promise<Assessment[]>;
  update(assessment: Assessment): Promise<Assessment>;
}

export interface SearchRepository {
  saveStrategy(strategy: SearchStrategy): Promise<SearchStrategy>;
  getStrategies(assessmentId: string): Promise<SearchStrategy[]>;
  appendLog(log: SearchLog): Promise<SearchLog>;
  getLogs(assessmentId: string): Promise<SearchLog[]>;
  saveTrials(assessmentId: string, trials: ClinicalTrial[]): Promise<void>;
  getTrials(assessmentId: string): Promise<ClinicalTrial[]>;
  savePublications(
    assessmentId: string,
    publications: Publication[],
  ): Promise<void>;
  getPublications(assessmentId: string): Promise<Publication[]>;
}

export interface EvidenceRepository {
  saveEvidence(evidence: ExtractedEvidence): Promise<ExtractedEvidence>;
  listEvidence(assessmentId: string): Promise<ExtractedEvidence[]>;
  saveReferenceTrial(reference: ReferenceTrial): Promise<ReferenceTrial>;
  removeReferenceTrial(assessmentId: string, nctId: string): Promise<void>;
  listReferenceTrials(assessmentId: string): Promise<ReferenceTrial[]>;
  saveSelectedPublication(
    publication: SelectedPublication,
  ): Promise<SelectedPublication>;
  removeSelectedPublication(assessmentId: string, pmid: string): Promise<void>;
  listSelectedPublications(
    assessmentId: string,
  ): Promise<SelectedPublication[]>;
}

export interface StrategyRepository {
  save(strategy: DevelopmentStrategy): Promise<DevelopmentStrategy>;
  getByAssessmentId(assessmentId: string): Promise<DevelopmentStrategy | null>;
}

export interface HistoricalBenchmarkRepository {
  save(benchmark: HistoricalBenchmark): Promise<HistoricalBenchmark>;
  getByAssessmentId(
    assessmentId: string,
    isMock?: boolean,
  ): Promise<HistoricalBenchmark | null>;
}

export interface VersionRepository {
  append(version: AssessmentVersion): Promise<AssessmentVersion>;
  list(assessmentId: string): Promise<AssessmentVersion[]>;
}

export interface ClinicalTrialsSearchInput extends PageRequest {
  strategy: ClinicalTrialsServerSearchStrategy;
  format?: "json";
  countTotal?: boolean;
}

export interface ClinicalTrialsConnector {
  search(
    input: ClinicalTrialsSearchInput,
  ): Promise<PageResult<ClinicalTrial>>;
  getByNctId(nctId: string): Promise<ClinicalTrial | null>;
}

export interface PubMedSearchInput extends PageRequest {
  query: string;
}

export interface PubMedConnector {
  search(input: PubMedSearchInput): Promise<PageResult<Publication>>;
  getByPmids(pmids: string[]): Promise<Publication[]>;
}

export interface EvidenceExtractionService {
  extract(
    assessmentId: string,
    publication: Publication,
  ): Promise<ExtractedEvidence>;
}

export interface StatisticalEngine {
  readonly status: "not_connected" | "ready";
  calculate(input: unknown): Promise<unknown>;
}

export interface CostEngine {
  readonly status: "not_connected" | "ready";
  estimate(input: unknown): Promise<unknown>;
}
