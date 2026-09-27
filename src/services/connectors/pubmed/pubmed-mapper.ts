import type { Publication } from "@/domain/models";
import { ConnectorError } from "@/services/connectors/connector-error";

type XmlRecord = Record<string, unknown>;

export function mapPubMedXml(payload: unknown): Publication[] {
  const root = asRecord(payload);
  const set = asRecord(root.PubmedArticleSet);
  const articles = asArray(set.PubmedArticle);

  return articles.map((article) => mapArticle(asRecord(article)));
}

function mapArticle(record: XmlRecord): Publication {
  const citation = asRecord(record.MedlineCitation);
  const article = asRecord(citation.Article);
  const journal = asRecord(article.Journal);
  const journalIssue = asRecord(journal.JournalIssue);
  const pubDate = asRecord(journalIssue.PubDate);
  const pubmedData = asRecord(record.PubmedData);
  const pmid = text(citation.PMID);

  if (!pmid) {
    throw new ConnectorError(
      "invalid_response",
      "PubMed returned an article without a PMID.",
      502,
    );
  }

  const authors = asArray(asRecord(article.AuthorList).Author)
    .map((author) => authorName(asRecord(author)))
    .filter(Boolean);
  const publicationTypes = asArray(
    asRecord(article.PublicationTypeList).PublicationType,
  )
    .map(text)
    .filter(Boolean);
  const meshTerms = asArray(asRecord(citation.MeshHeadingList).MeshHeading)
    .map((heading) => text(asRecord(heading).DescriptorName))
    .filter(Boolean);
  const abstract = asArray(asRecord(article.Abstract).AbstractText)
    .map((section) => {
      const sectionRecord = asRecord(section);
      const content = text(section);
      const label = text(sectionRecord["@_Label"]);
      return label && content ? `${label}: ${content}` : content;
    })
    .filter(Boolean)
    .join("\n\n");
  const articleIds = asArray(asRecord(pubmedData.ArticleIdList).ArticleId);
  const doi =
    articleIds
      .map((item) => asRecord(item))
      .find((item) => text(item["@_IdType"]).toLowerCase() === "doi")
      ?.["#text"] ?? findElectronicDoi(article);
  const sourceUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

  return {
    pmid,
    title: text(article.ArticleTitle) || "Title not available",
    authors,
    journal: text(journal.Title) || text(citation.MedlineJournalInfo),
    publicationDate: formatPublicationDate(pubDate, article),
    publicationTypes,
    abstract: abstract || undefined,
    meshTerms,
    doi: text(doi) || undefined,
    sourceUrl,
    selected: false,
    evidenceCategories: [],
    reviewStatus: "unreviewed",
    source: {
      id: `pubmed:${pmid}`,
      type: "pubmed",
      externalId: pmid,
      label: `PMID ${pmid}`,
      url: sourceUrl,
      accessedAt: new Date().toISOString(),
    },
  };
}

function authorName(author: XmlRecord) {
  const collectiveName = text(author.CollectiveName);
  if (collectiveName) return collectiveName;
  return [text(author.ForeName), text(author.LastName)]
    .filter(Boolean)
    .join(" ");
}

function formatPublicationDate(pubDate: XmlRecord, article: XmlRecord) {
  const articleDate = asRecord(asArray(article.ArticleDate)[0]);
  const year = text(articleDate.Year) || text(pubDate.Year);
  const month = text(articleDate.Month) || text(pubDate.Month);
  const day = text(articleDate.Day) || text(pubDate.Day);
  if (year) return [year, month, day].filter(Boolean).join("-");
  return text(pubDate.MedlineDate) || undefined;
}

function findElectronicDoi(article: XmlRecord) {
  return asArray(article.ELocationID)
    .map((item) => asRecord(item))
    .find((item) => text(item["@_EIdType"]).toLowerCase() === "doi")?.[
    "#text"
  ];
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): XmlRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlRecord)
    : {};
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const record = value as XmlRecord;
    if (record["#text"] !== undefined) return text(record["#text"]);
    return Object.entries(record)
      .filter(([key]) => !key.startsWith("@_"))
      .map(([, child]) => text(child))
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return "";
}
