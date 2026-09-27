import type {
  EvidenceCategory,
  Publication,
  PublicationExclusionReason,
  PublicationReviewStatus,
} from "@/domain/models";

export interface SavedPublicationEvidence {
  assessmentId: string;
  publication: Publication;
  categories: EvidenceCategory[];
  reviewStatus: PublicationReviewStatus;
  exclusionReason?: PublicationExclusionReason;
  selectedAt: string;
}

export interface PublicationSelectionRepository {
  list(assessmentId: string): Promise<SavedPublicationEvidence[]>;
  add(
    assessmentId: string,
    category: EvidenceCategory,
    publication: Publication,
  ): Promise<SavedPublicationEvidence[]>;
  remove(
    assessmentId: string,
    category: EvidenceCategory,
    pmid: string,
  ): Promise<SavedPublicationEvidence[]>;
  updateReview(
    assessmentId: string,
    pmid: string,
    reviewStatus: PublicationReviewStatus,
    exclusionReason?: PublicationExclusionReason,
  ): Promise<SavedPublicationEvidence[]>;
}

const STORAGE_PREFIX = "cde:publication-evidence:v1:";

export class LocalStoragePublicationSelectionRepository
  implements PublicationSelectionRepository
{
  async list(assessmentId: string) {
    return this.read(assessmentId);
  }

  async clear(assessmentId: string) {
    window.localStorage.removeItem(storageKey(assessmentId));
  }

  async add(
    assessmentId: string,
    category: EvidenceCategory,
    publication: Publication,
  ) {
    const current = this.read(assessmentId);
    const existing = current.find(
      (item) => item.publication.pmid === publication.pmid,
    );
    const nextItem: SavedPublicationEvidence = existing
      ? {
          ...existing,
          categories: Array.from(new Set([...existing.categories, category])),
        }
      : {
          assessmentId,
          publication,
          categories: [category],
          reviewStatus: "unreviewed",
          selectedAt: new Date().toISOString(),
        };
    const next = [
      ...current.filter(
        (item) => item.publication.pmid !== publication.pmid,
      ),
      nextItem,
    ];
    this.write(assessmentId, next);
    return next;
  }

  async remove(
    assessmentId: string,
    category: EvidenceCategory,
    pmid: string,
  ) {
    const next = this.read(assessmentId).flatMap((item) => {
      if (item.publication.pmid !== pmid) return [item];
      const categories = item.categories.filter((item) => item !== category);
      return categories.length ? [{ ...item, categories }] : [];
    });
    this.write(assessmentId, next);
    return next;
  }

  async updateReview(
    assessmentId: string,
    pmid: string,
    reviewStatus: PublicationReviewStatus,
    exclusionReason?: PublicationExclusionReason,
  ) {
    const next = this.read(assessmentId).map((item) =>
      item.publication.pmid === pmid
        ? { ...item, reviewStatus, exclusionReason }
        : item,
    );
    this.write(assessmentId, next);
    return next;
  }

  private read(assessmentId: string): SavedPublicationEvidence[] {
    const rawValue = window.localStorage.getItem(storageKey(assessmentId));
    if (!rawValue) return [];
    try {
      const parsed = JSON.parse(rawValue) as unknown;
      return Array.isArray(parsed)
        ? (parsed as SavedPublicationEvidence[])
        : [];
    } catch {
      return [];
    }
  }

  private write(
    assessmentId: string,
    publications: SavedPublicationEvidence[],
  ) {
    window.localStorage.setItem(
      storageKey(assessmentId),
      JSON.stringify(publications),
    );
  }
}

function storageKey(assessmentId: string) {
  return `${STORAGE_PREFIX}${assessmentId}`;
}
