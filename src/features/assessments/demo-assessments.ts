import type { AssessmentStatus, RequestType } from "@/domain/models";
import {
  DEMO_ASSESSMENT_ID,
  DEMO_CANDIDATE_NAME,
} from "@/lib/demo-assessment";

export interface AssessmentListItem {
  id: string;
  candidate: string;
  indication: string;
  phase: string;
  requestType: RequestType;
  requester: string;
  owner: string;
  status: AssessmentStatus;
  createdDate: string;
  lastUpdated: string;
}

export const demoAssessments: AssessmentListItem[] = [
  {
    id: DEMO_ASSESSMENT_ID,
    candidate: DEMO_CANDIDATE_NAME,
    indication: "Atopic Dermatitis",
    phase: "Phase 2",
    requestType: "new_development",
    requester: "Demo Requester",
    owner: "Demo Clinical Reviewer",
    status: "draft",
    createdDate: "2026-09-27",
    lastUpdated: "2026-09-27",
  },
];
