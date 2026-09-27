import type {
  Assessment,
  AssessmentStatus,
  Candidate,
  RequestType,
} from "@/domain/models";

export interface NewAssessmentInput {
  candidate: Omit<Candidate, "id">;
  researchQuestion: string;
  requestType: RequestType;
  requesterDepartment: string;
  requester: string;
  owner: string;
  status?: AssessmentStatus;
}

export interface BrowserAssessmentRepository {
  create(input: NewAssessmentInput): Promise<Assessment>;
  getById(id: string): Promise<Assessment | null>;
  list(): Promise<Assessment[]>;
  update(assessment: Assessment): Promise<Assessment>;
}

const STORAGE_KEY = "cde:assessments:v1";

export class LocalStorageAssessmentRepository
  implements BrowserAssessmentRepository
{
  async create(input: NewAssessmentInput): Promise<Assessment> {
    const assessments = this.read();
    const now = new Date().toISOString();
    const id = nextAssessmentId(assessments);
    const assessment: Assessment = {
      id,
      candidate: {
        ...input.candidate,
        id: `${id}:candidate`,
      },
      researchQuestion: {
        id: `${id}:question`,
        text: input.researchQuestion,
        createdAt: now,
      },
      requestType: input.requestType,
      requesterDepartment: input.requesterDepartment,
      requester: input.requester,
      owner: input.owner,
      status: input.status ?? "draft",
      currentVersion: "v0.1",
      reviewStatus: "ai_draft",
      selectedReferenceTrialIds: [],
      selectedPublicationPmids: [],
      createdAt: now,
      updatedAt: now,
      createdBy: input.requester,
      updatedBy: input.requester,
    };

    this.write([...assessments, assessment]);
    return assessment;
  }

  async getById(id: string): Promise<Assessment | null> {
    return this.read().find((assessment) => assessment.id === id) ?? null;
  }

  async list(): Promise<Assessment[]> {
    return this.read();
  }

  async update(assessment: Assessment): Promise<Assessment> {
    const assessments = this.read();
    const next = assessments.map((current) =>
      current.id === assessment.id ? assessment : current,
    );
    if (!next.some((current) => current.id === assessment.id)) {
      next.push(assessment);
    }
    this.write(next);
    return assessment;
  }

  private read(): Assessment[] {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return [];

    try {
      const parsed = JSON.parse(rawValue) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter(isStoredAssessment)
        : [];
    } catch {
      return [];
    }
  }

  private write(assessments: Assessment[]) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(assessments));
  }
}

function nextAssessmentId(assessments: Assessment[]) {
  const year = new Date().getFullYear();
  const prefix = `ASSESS-${year}-`;
  const highest = assessments.reduce((currentHighest, assessment) => {
    if (!assessment.id.startsWith(prefix)) return currentHighest;
    const sequence = Number(assessment.id.slice(prefix.length));
    return Number.isFinite(sequence)
      ? Math.max(currentHighest, sequence)
      : currentHighest;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

function isStoredAssessment(value: unknown): value is Assessment {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Assessment>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.candidate?.name === "string" &&
    typeof candidate.researchQuestion?.text === "string"
  );
}
