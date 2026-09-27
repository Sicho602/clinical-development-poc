# Evidence Extraction Adapter

The PoC keeps domain logic provider-neutral and calls an OpenAI-compatible
Chat Completions endpoint. Configure:

```text
EVIDENCE_EXTRACTION_API_URL=https://provider.example/v1/chat/completions
EVIDENCE_EXTRACTION_API_KEY=optional-secret
EVIDENCE_EXTRACTION_MODEL=optional-provider-model
```

The API URL and key are used only by the Next.js backend. They are never
returned to the browser. If `EVIDENCE_EXTRACTION_MODEL` is omitted, no model
field is sent and the endpoint must apply its configured default.

## Data egress policy

Only public PubMed data may be sent to the external provider:

- PMID
- publication title
- abstract
- publication types
- evidence categories

Assessment ID, candidate, research question, requester, owner, reviewer, and
all other internal metadata are rejected by the strict internal API schema
and are never included in the provider message. The browser first reduces the
selected Publication to this allowlist; the backend validates the same
allowlist again.

The API key is read only from a server-side environment variable. The
server-only provider module is not imported by client components. Request and
response bodies are not written to console or application logs. `.env.local`
and `.env.*.local` are ignored by git.

The backend sends system/user messages and requests a JSON object. The
assistant message content must contain:

```json
{
  "fields": [
    {
      "field": "orr",
      "value": 21,
      "unit": "%",
      "sourceText": "The objective response rate was 21%..."
    }
  ]
}
```

`sourceText` is mandatory for every field. The backend only stores a field
when its normalized source text occurs in the PubMed abstract. A rejected
field is recorded as `SOURCE_MISMATCH` without entering the Evidence Matrix.
Missing facts must be omitted; they must not be inferred.

The browser repository preserves the original AI value separately from the
reviewed value. Approve, Edit, and Reject are stored per field with reviewer
and review date. Only approved reviewed values are shown as usable structured
facts in the Evidence Matrix.

## Mock provider

For deterministic PoC validation:

```text
EVIDENCE_EXTRACTION_PROVIDER=mock
```

The mock provider uses versioned JSON fixtures for the five validation PMIDs.
Every fixture source span is validated against the current PubMed abstract by
the same exact-substring gate used for external providers. It returns the
same normalized provider result contract with:

```json
{
  "provider": "mock",
  "model": "fixture-v1",
  "isMock": true
}
```

Mock and real extraction records use separate repository identities
(`assessment + mode + PMID`). Review, Matrix, and Validation screens load
only the currently configured provider mode, so mock values cannot overwrite
or silently mix with real provider results.
