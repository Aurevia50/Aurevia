# Transition Document Management System

## 1. Purpose and scope

Build a secure, auditable system for staff handovers, operational/process transitions, system migrations, project close-outs, and knowledge-transfer packs. It is an organization-wide records workflow, not a general-purpose public file share.

The design is intended for a regulated financial institution and provides controls commonly expected in a bank-grade records platform. It does not itself establish regulatory compliance, certification, or legal sufficiency. Compliance, Legal, Information Security, Records Management, and the relevant data-protection authority must approve retention schedules, legal holds, data residency, encryption, and operating procedures before production use.

### Current application fit

- The application is Next.js with server-side TypeScript routes, Prisma, PostgreSQL, NextAuth, Supabase Storage, and existing notifications and audit-log patterns.
- KYC and tax-case documents already have private storage keys and metadata, but neither model is a transition-document repository. Do not reuse their tables or weaken their isolation.
- The current `AuditLog` is useful application history but is not, by itself, tamper-proof. A database owner can alter ordinary rows. Do not describe it as immutable.
- Existing authentication is application-managed. Department hierarchy, HR employee records, SSO/Active Directory synchronization, a retention engine, malware scanning, and a WORM archive are not established capabilities. These are prerequisites or separately approved integrations, not assumed services.

## 2. Product boundaries and non-negotiable controls

1. All access is private and denied by default. Storage objects are never public.
2. Authorization is enforced on the server for every list, metadata, preview, download, version, approval, and administrative action.
3. User IDs, department IDs, roles, storage keys, approval state, and retention instructions supplied by a browser are untrusted.
4. The system stores originals as immutable byte sequences. A new upload creates a new version; it never replaces the source bytes.
5. Workflow approval, access authorization, and file scanning are distinct controls. An approved document is not automatically public to the department.
6. Every view, preview, download, permission change, approval, rejection, restore, export, hold, and purge is auditable.
7. Legal holds and retention restrictions block deletion. No user or administrator may bypass a legal hold.
8. External AI, HR, email, or SSO services receive no document content until a separate security, privacy, vendor, and data-processing review approves the integration.
9. No change to financial ledgers, customer balances, orders, or trading authorization is part of this feature.
10. Do not ship with default roles that accidentally grant organization-wide access. Map all access through configured organization membership and policy.

## 3. Users, roles, and authorization

### Roles

- **Contributor / outgoing staff member:** create and edit drafts they own; upload new versions; nominate participants; submit for review; respond to review comments.
- **Transition owner / incoming staff member:** access explicitly assigned transition packs; acknowledge handover completion; add completion notes if policy allows.
- **Supervisor:** review and approve assigned documents; request changes; assign a successor; cannot approve their own submission.
- **Department head:** final departmental approval; can view department-scoped records according to policy.
- **Compliance reviewer:** review documents routed by classification, document type, policy, or explicit referral; access is limited to assigned cases.
- **IT / security reviewer:** review system, credential, infrastructure, security, and migration materials routed to them. Secret values must not be stored in this system.
- **Document controller / records manager:** organization-wide metadata and workflow administration, retention scheduling, archive/restore, controlled reassignment, and reports. Content access remains purpose-scoped and audited.
- **System administrator:** administer configuration and integrations. Administrative system access must not imply routine right to read document contents.
- **Auditor:** read-only access to approved audit evidence and compliance reports, with no ability to alter source documents or access grants.

### Authorization policy

Use deny-by-default, server-enforced attribute-based access control (ABAC) over organization membership, department, project/team assignment, document sensitivity, lifecycle status, explicit grants, and purpose of access. Roles alone are insufficient.

Initial policy scopes:

1. **Owner-only:** contributor and specifically assigned reviewers.
2. **Transition team:** named outgoing/incoming participants and assigned reviewers.
3. **Department:** active department members only where the document's access policy explicitly permits it.
4. **Need-to-know:** named users and approved role groups only.
5. **Restricted / highly restricted:** named access, stronger authentication, restricted preview/download policy, and dual control for controller overrides or bulk export.

Every access check includes current user status, organization membership, document state, sensitivity, and any access expiry. Revocation takes effect immediately on subsequent requests. Cache authorization briefly or not at all; never cache signed URLs beyond their short lifetime. Use a short-lived access token only after an authorization decision, and record the issued access event.

Administrative override requires an allowed privilege, a mandatory reason, fresh authentication, and a full audit event. For restricted records, require a second authorized approver. No override defeats legal hold, retention lock, or immutable-version controls.

## 4. Transition workflow

### Initiation triggers

Support manual creation and future idempotent integrations for:

- Employee departure, role change, leave, or succession.
- Process owner or control-owner change.
- System migration, decommissioning, or material configuration change.
- Project closure or vendor hand-back.
- Periodic operational-control review.

An integration trigger creates a draft transition case, not an approved document and not an access grant. Duplicate HR events must be idempotent. Validate trigger signatures and source identity, record provenance, and route unmatched identities to an authorized operator.

### Case and document lifecycle

Transition case:

`DRAFT → ACTIVE → HANDOVER_PENDING → COMPLETED → ARCHIVED`

Documents have a logical lifecycle:

`DRAFT → UNDER_REVIEW → APPROVED → ARCHIVED`

Review rejection returns the document to `DRAFT` with a recorded reason. A material edit to an approved document creates a new draft version and returns the logical document to `UNDER_REVIEW`; the previously approved version remains available according to retention and permissions. A document can be withdrawn or superseded only through an audited transition. Deletion is a separate retention-controlled operation and is not a normal lifecycle status.

### Standard workflow

1. Contributor selects a template and transition type, opens a case, and records required metadata and participants.
2. The system validates required sections and metadata. Files upload to quarantine and are not downloadable by other users until scan and validation pass.
3. Contributor submits a specific immutable version for review.
4. Policy creates ordered approval steps. Typical sequence: outgoing staff → supervisor → department head → Compliance and/or IT/Security when the policy requires them. Compliance and IT may be parallel gates where policy allows; the final approval waits for every required gate.
5. Reviewers approve, reject, or request changes. Each decision records actor, timestamp, decision, comments, policy version, and exact document-version ID.
6. After all required approvals, the submitted version becomes the approved version. Notify assigned incoming staff and records management.
7. Incoming staff acknowledges receipt and completion. Acknowledgment records receipt, not the truth or correctness of the content.
8. On case completion, calculate retention dates from the applicable approved policy and transition event. Archive only after workflow completion and access review.

### Workflow invariants

- Submit, approve, reject, reassign, complete, archive, and restore are transactional state transitions with optimistic concurrency or serializable protection.
- A user cannot approve a version they authored or materially edited. Enforce separation of duties in the service, not just the UI.
- An approval is tied to an exact version hash; later edits invalidate approval for the new version.
- No transition skips a mandatory reviewer. Policy changes apply to new submissions unless a compliance-approved migration explicitly reopens existing cases.
- Stale tasks expire and escalate by policy. Escalation never silently approves a document.
- Reminders are idempotent, rate-limited, and do not disclose sensitive document titles or content in email/push previews.

## 5. Templates and required content

Provide controlled, versioned templates for:

- Staff handover and role transition.
- Process/control transition.
- System migration and decommissioning.
- Project close-out and vendor transition.
- Operational knowledge-transfer pack.

Templates define required sections, structured questions, required metadata, attachment categories, approval policy, classification floor, and retention-policy selector. A template revision does not rewrite documents already created from a prior revision; each case stores its template ID and version.

Common structured sections include purpose and scope, current state, critical dates, recurring tasks, dependencies, known risks/issues, control evidence references, open actions and owners, escalation contacts, access/credential-transfer checklist (never the credentials themselves), rollback/continuity notes, acceptance criteria, and successor acknowledgment.

## 6. Data model and migration outline

Additive Prisma models and migrations only. Preserve existing rows and relations. Use restrictive deletion behavior for records and actors needed for audit evidence. The following is a logical model; exact Prisma field types, indexes, and enum values should be reviewed against existing conventions before implementation.

### Organization and policy

- `Department`: stable identifier, name, parent department, active state.
- `DepartmentMembership`: user, department, membership role, effective dates, source, synchronization timestamp. Enforce one active primary department where required.
- `TransitionTemplate`: type, name, revision, schema/config JSON, active dates, creator, approval status.
- `RetentionPolicy`: policy code/version, record class, retention duration or event rule, disposition action, jurisdiction, legal basis, effective dates, approvers. Policies are immutable after use; create a new revision.
- `TransitionWorkflowPolicy`: transition type, classification threshold, ordered/parallel reviewer requirements, deadlines, escalation rules, separation-of-duties constraints, template and policy versions.

### Workflow records

- `TransitionCase`: type, reference, title, purpose, department, owner, outgoing/incoming participants, trigger source/reference, status, due/completion dates, template version, retention-policy version, created/updated timestamps.
- `TransitionParticipant`: case, optional internal user relation, external staff reference, participant function, effective dates, acknowledgment state and timestamp. Store only necessary HR data.
- `TransitionDocument`: case, document type, title, summary, department, owner, sensitivity, related participants, status, access policy, retention rule/date, legal hold state, current approved version, creator, timestamps, archived/deleted state.
- `TransitionDocumentVersion`: document, monotonically increasing version, immutable source filename, detected MIME, byte size, SHA-256, created by, created time, scan status, extracted-text status, submission/approval state, template version, parent version. Unique `(documentId, version)`.
- `TransitionArtifact`: version, artifact kind, opaque storage object ID/key, original filename, MIME, byte size, hash, scan result, upload and verification times. Each attachment is an original object with its own hash.
- `TransitionApproval`: document version, step/policy, assigned reviewer or role, decision, reason/comment, actor, timestamps. Enforce one decision per required step; retain reassignment history.
- `TransitionAccessGrant`: document/case, grantee user or group, scope, purpose, granted by, created/expiry/revocation dates. Grant never broadens beyond classification policy.
- `TransitionLegalHold`: record scope, matter reference, authority/owner, reason, start/release state, issued/released by, timestamps. Release requires designated Legal/Records authority and audit evidence.
- `TransitionAuditEvent`: append-only event ID, actor and effective subject, action, entity/version, timestamp, request/correlation ID, reason, policy decision, source, redacted metadata, prior-event hash and event hash.
- `TransitionSearchMetadata`: normalized metadata and access-controlled full-text search representation. Do not store document content in client-visible JSON.
- `TransitionOutboxEvent`: transactional notification/integration work item, idempotency key, attempts, scheduling and completion status.

Use enums for lifecycle and scan states. Add indexes for department/status, owner/status, case/date, document/version, retention/disposition dates, approval reviewer/status/due date, and audit subject/entity/time. Add database constraints for unique references, version numbering, and mutually exclusive active grants where possible.

## 7. Secure storage and file lifecycle

### Object storage

Use a private, dedicated transition-documents bucket or approved private object store. Do not share KYC, tax, support, or public assets buckets. Object names are random opaque IDs; never encode names, emails, departments, or classification in paths. The database is the authorization authority.

Use TLS for transport and provider-managed encryption at rest as a baseline. Before production, verify the provider's region, replication, backup, access logs, encryption, deletion semantics, and incident terms. For higher classifications, use envelope encryption with KMS/HSM-managed keys and key separation by environment and data domain; only wrapped data keys are stored with metadata. Key use is server-side, least-privilege, audited, and rotated under a documented plan.

Supabase service-role credentials remain server-only. Browser clients never receive the service-role key or a permanent object URL. Storage policies must deny unauthenticated access; direct browser access is only through narrowly scoped, short-lived, object-specific signed requests generated after application authorization.

### Upload and scan pipeline

1. Authenticate and authorize case/document creation; validate metadata and quota.
2. Create an upload intent with a random object ID, expected size, accepted file types, expiry, user, and idempotency key.
3. Upload to a private quarantine location with a short-lived capability. Enforce request and per-file limits at both application and storage layers.
4. Verify actual size, hash, filename normalization, magic bytes, and MIME; never trust extension or browser MIME.
5. Run malware scanning, archive inspection, and policy checks. ZIP uploads require path traversal, symlink, nested archive, decompression-ratio, and expanded-size protections. Reject encrypted archives unless an approved workflow can scan them safely.
6. Mark clean, promote the immutable object to the controlled private prefix, and create the version/artifact records transactionally. Failed or expired intents are cleaned by a bounded job and audited.
7. Generate previews from a separate sanitized derivative. Never mutate or replace the original. Disable active content, macros, scripts, external references, and embedded files in preview rendering.

Initially support PDF, DOCX, XLSX, common raster images, and ZIP packages with explicit configured limits. Reject executable formats and unsupported or malformed files. Treat SVG, HTML, and office documents with embedded active content as untrusted; serve as attachment or render only in a sandbox.

### Download and preview

- Re-authorize every request and log it before issuing a short-lived, single-object signed URL or proxy stream.
- Force `Content-Disposition: attachment` for originals, sanitize the presented filename, set `X-Content-Type-Options: nosniff`, and prevent public caching.
- Complete-package export creates a time-limited ZIP containing exactly the authorized approved version and approved attachments, plus a manifest with version, hashes, document IDs, export actor/time, and classification. The job checks authorization both when queued and when generated; no stale export survives revocation.
- Optional visible watermarking applies to a derivative only and must not alter the preserved source. Record watermark policy and export event.
- Apply rate limits, file-size limits, concurrent-download limits, and alerting for unusual bulk access.

## 8. Metadata, search, and reporting

### Mandatory metadata

Every document must include:

- Document type and transition type.
- Department and transition/case reference.
- Title, purpose/description, owner, creator, and responsible records owner.
- Related outgoing/incoming staff or participants using internal IDs where available; use a controlled external reference otherwise.
- Created, effective, submitted, approved, completed, and archive dates as applicable.
- Sensitivity/classification, access scope, and any handling restrictions.
- Retention-policy code/version, retention trigger, calculated disposition date, and legal-hold state.
- Source/template version, original filename, MIME type, size, SHA-256, version number, scan state, and storage object ID.
- Approval policy version, required reviewers, decision timestamps, and exact approved version.

Validate against policy on the server. Missing retention or classification data prevents submission. Do not accept client-computed retention deadlines or approval states.

### Search

Phase 1: metadata filters and PostgreSQL full-text search over authorized records, using extracted text from clean files. Queries must first constrain candidate records by current permissions, then rank/search within the authorized set; avoid a global index endpoint that leaks existence or snippets. Search responses, suggestions, counts, and error messages must not reveal inaccessible titles or matching terms.

Provide filters for type, department, owner/participant, status, date range, sensitivity, retention date, case, and approval state. Use stable pagination and audit searches that access sensitive metadata.

Saved searches store query filters, owner, optional explicitly shared audience, and timestamps; re-evaluate authorization on every use. Do not save raw document text in search history.

Phase 2: semantic search only after privacy/security approval. Use an organization-controlled model or a vetted provider with no training, approved residency, retention controls, and a documented data-processing agreement. Exclude restricted classes by default. Generate embeddings from clean extracted text in a segregated access-controlled store, apply ACL filtering before returning results, and provide citations to source document/version. Never let a model grant access, approve documents, perform workflow transitions, or disclose unauthorized content. The system must work with semantic search disabled.

### Personal history and reports

Users can see their own recent views/downloads where policy allows. Controllers can report on records, approvals, overdue tasks, expiring retention, holds, access, downloads, exports, scan failures, and disposition outcomes. Reports are permission-filtered, date-bounded, paginated, and exportable as CSV/PDF with a generation audit event. Bulk reports involving restricted data require explicit scope and reason.

## 9. Audit, records retention, legal hold, and disposition

### Audit events

Record at least: create, metadata edit, upload intent, scan result, version create, submit, each approval decision, assignment/reassignment, view, preview, download, export, grant/revoke access, search of sensitive scopes, archive/restore, hold create/release, retention change, purge request/result, admin override, and integration event.

Capture actor, effective user, action, entity/version, UTC time, request/correlation ID, source, reason, authorization decision, policy version, and relevant before/after hashes. Redact secrets and document contents; do not log signed URLs, credentials, full extracted text, or sensitive query strings.

For defensible immutability, stream audit events to an independently administered append-only or WORM destination with retention lock and restricted deletion. A hash chain is useful for tamper evidence but is not a substitute for independent immutable storage. Alert on delivery gaps; transactional outbox events permit retry without losing the originating database operation.

### Retention and legal hold

- Retention derives from an approved policy version and a defined triggering event (for example, transition completion, contract close, or statutory date).
- Retention policy changes are versioned and approved by Records Management and Compliance.
- A hold suspends disposition for its scope and descendants, including versions, attachments, previews, text indexes, and generated exports. Hold release is separately authorized and audited.
- Warn owners and records managers before a scheduled disposition; provide a review and exception workflow.
- Purging requires the policy deadline to have passed, no active holds, completed approval, no active access/legal request, and verified backups/replicas expiry behavior. High-sensitivity purges require dual control.
- Purge original objects, derivatives, extracted text, embeddings, caches, and exports under documented provider deletion guarantees. Retain the minimal non-content disposition evidence and audit record according to policy.
- Soft-delete is a reversible workflow marker, not a substitute for legal hold or final disposition. Restore must preserve the full version history and re-check permissions.

The first production release should support retention calculation, reminders, hold creation, and disposition review, but keep automated content purging disabled until provider deletion behavior and legal policy are validated in a non-production environment.

## 10. Notifications and integrations

Notifications: assignment, review needed, requested changes, approval/rejection, incoming-staff acknowledgment, overdue task, retention warning, hold event, scan failure, and access revocation. Notification content is minimal and links to an authenticated page. Respect user preferences, quiet hours, and delivery retries; deduplicate through an outbox key.

Integration boundaries:

- **HRIS:** signed events or scheduled delta sync for employee lifecycle and manager/department attributes. Idempotent event IDs; quarantine unmatched identities; avoid copying unnecessary HR attributes.
- **SSO/Directory:** OIDC/SAML provider and SCIM or directory sync are separate deployment features. Require MFA and prompt deprovisioning. Do not treat group claims as current authorization without expiry/synchronization checks.
- **Email:** send minimal notification content only; never attach sensitive documents by default.
- **Records/WORM archive:** export approved records and audit manifests over a service identity with acknowledgments and reconciliation.
- **Search/AI:** optional, private, classified-data-aware service as described above.

All integration secrets are server-only. Use an outbox and dead-letter/replay controls; signatures, timestamps, replay protection, idempotency, rate limits, structured sanitized logs, and per-integration health status are mandatory.

## 11. API and UI surface

Suggested authenticated routes (names may follow established repository conventions):

- `GET/POST /api/transitions` — list/create cases; enforce department and owner scope.
- `GET/PATCH /api/transitions/:caseId` — details and permitted metadata/state changes.
- `GET/POST /api/transitions/:caseId/documents` — list/create logical documents.
- `GET/PATCH /api/transition-documents/:documentId` — metadata and current state.
- `POST /api/transition-documents/:documentId/upload-intents` — create constrained upload.
- `POST /api/transition-uploads/:intentId/complete` — verify scan/hash and commit a new immutable version.
- `GET /api/transition-documents/:documentId/versions` — authorized version history.
- `POST /api/transition-documents/:documentId/submit` — submit exact draft version.
- `POST /api/transition-approvals/:approvalId/decision` — approve/reject/request changes.
- `POST /api/transition-documents/:documentId/access` — request/grant/revoke access under policy.
- `POST /api/transition-documents/:documentId/download` — audited original/package download authorization.
- `POST /api/transition-documents/:documentId/archive` — policy-controlled archive.
- `GET/POST /api/transition-search` — permission-filtered search and saved search operations.
- `/api/admin/transition-documents/*` — separate `requireAdmin`/document-controller guards, reporting and policy administration; no generic unaudited override.
- Internal scheduled worker for reminders, scan reconciliation, outbox delivery, archive, and retention review. It must use an authenticated worker secret/service identity and must not be a public unauthenticated cron endpoint.

Every mutating route uses Zod validation, `requireUser` or the appropriate privileged guard, rate limiting, idempotency where retries are possible, ownership/department checks, audit writing, and consistent no-store responses. Do not return object keys, service credentials, or raw provider errors to the browser.

UI pages:

- `/transitions`: assigned, owned, team-visible cases with filters, due dates, and clear states.
- `/transitions/new`: type-specific wizard/template and required metadata.
- `/transitions/[caseId]`: case summary, participant list, open actions, documents, approvals, timeline, and acknowledgment.
- `/transition-documents/[documentId]`: metadata, permission-aware preview/download, version history, approvals, access, and retention/hold status.
- `/transition-search`: metadata/full-text filters, accessible snippets, saved searches.
- Admin document control: queue, global permitted search, policy/templates, access grants, retention/hold reviews, archive/restore, bulk actions, and reports.

All pages need responsive layouts, keyboard access, accessible status labels, clear empty/loading/error/success states, and no implication that a record is approved while it remains under review. Approval and destructive actions require explicit confirmation and show version/effect details.

## 12. Security, operations, and resilience

- Threat-model insider access, compromised accounts, IDOR, signed-URL leakage, malware, archive bombs, XSS/active documents, search side channels, accidental bulk exports, key loss, storage outages, and malicious/incomplete HR events.
- Require MFA for reviewers and administrators before production rollout; apply step-up authentication for restricted downloads and overrides.
- Enforce least privilege for application DB role, storage service identity, scanner, indexer, notification worker, and retention worker.
- Protect secrets with the deployment secret manager; rotate and audit keys. Never place secrets in `NEXT_PUBLIC_*`, logs, browser storage, or checked-in files.
- Use CSRF protections for cookie-authenticated mutations, secure session settings, rate limiting, request-size limits, and security headers.
- Maintain encrypted backups and test restore of metadata, object references, keys, and audit evidence together. Define RPO/RTO with business owners.
- Monitor upload/scan latency, scan failure queue, approval SLA, outbox lag, unauthorized attempts, bulk download anomalies, storage errors, audit sink lag, retention jobs, and integration health.
- Establish incident response for suspected disclosure, corrupted objects, key compromise, missed retention action, and audit pipeline outage. Fail closed for file access if authorization or required scan/hold state cannot be verified.
- Keep audit and core workflow available if optional semantic search or notification providers fail.

## 13. Implementation plan

### Phase 0 — governance and prerequisites

Obtain approved classification taxonomy, records schedule, legal-hold policy, department/identity source, MFA requirements, jurisdiction, file-size limits, export restrictions, and vendor/security review. Confirm private storage region, encryption, access logging, backup and deletion guarantees. Decide whether current Supabase Storage meets the highest classification; do not assume it does.

### Phase 1 — secure MVP

Additive schema migration; case/document metadata; templates; private upload quarantine; file validation and malware scanning; immutable versions; owner/team authorization; sequential approvals; notifications; audited preview/download; admin queue; unit/route tests. No AI, automatic purge, external HR sync, or cross-organization sharing.

### Phase 2 — controls and records operations

Department membership; policy-driven parallel reviewers; approved retention schedules; legal holds; archive/restore; records dashboard; WORM audit export; bulk upload and controlled reports; reconciliation jobs; penetration test and disaster-recovery exercise.

### Phase 3 — integrations and advanced search

HRIS/SSO/SCIM integrations; full-text extraction; saved searches; optional governed semantic search; WORM archive integration; automated disposition only after legal/provider validation and dual-control rollout.

Each phase uses feature flags and progressive access grants. Deploy schema additively, deploy code compatible with old and new records, backfill only from verified sources, validate counts and permissions, then enable the feature. Never reset or replace the existing database.

## 14. Test and acceptance criteria

### Authorization and workflow

- Anonymous, suspended, wrong-department, wrong-owner, expired-grant, and cross-user requests cannot list, infer, preview, or download a record.
- Every route independently enforces access; UI hiding alone is insufficient.
- Contributor cannot self-approve; one missing parallel reviewer blocks approval; approvals bind to a specific immutable version.
- A post-approval edit creates a new draft and leaves the prior approved version unchanged.
- Repeated requests with the same idempotency key do not create duplicate cases, uploads, approval events, or notifications.
- Admin override requires the correct privilege, reason, fresh authentication, second approver for restricted records, and audit evidence.

### File security and integrity

- Reject oversized, spoofed-MIME, malformed, encrypted, executable, infected, and archive-bomb files; no quarantined object is downloadable.
- Verify SHA-256 and exact byte preservation for every original and attachment.
- Signed upload/download URLs expire; revoked users cannot use newly issued URLs. Test the residual expiry window and keep it within policy.
- Preview is isolated and sanitized; download uses attachment disposition, no public cache, and no content leakage in logs.
- Complete-package export includes only the explicitly authorized version/artifacts and a verifiable manifest; bulk export is audited.

### Audit, hold, and retention

- Log every required sensitive action; redaction tests prove no secrets, signed links, or document bodies enter logs.
- Simulate audit-sink outage and prove events remain queued and access policy fails closed where required.
- A legal hold prevents archive purge across originals, derivatives, index data, and exports; authorized release and disposition are separately recorded.
- Retention and purge simulations include due date, policy version, legal hold, approval, retry, and partial storage failure. Production purge remains disabled until sign-off.

### Operations and UX

- Test reminder/outbox retries, duplicate HR triggers, deprovisioning, storage outage, scanner outage, database failover, backup restore, and key rotation.
- Accessibility and responsive tests cover keyboard-only workflow, screen readers, mobile layouts, and confirmation/error states.
- Security review and penetration test cover IDOR, CSRF, XSS, stored active content, archive handling, search side channels, authorization races, and bulk data exfiltration.

## 15. Release gates and unresolved decisions

Do not call the feature production-ready until all of these are decided and verified:

- Legal/Compliance-approved retention schedule, legal-hold authority, and disposition process.
- Approved data classifications, user/department source of truth, and segregation-of-duties matrix.
- SSO/MFA and employee deprovisioning expectations.
- Storage region, encryption/key custody, WORM audit destination, malware scanning, backup/restore, and deletion guarantees.
- Maximum file and package sizes, supported formats, archive policy, and preview-rendering sandbox.
- Semantic-search model/vendor, if any, and documented data processing terms.
- Operational on-call owner, incident runbooks, RPO/RTO, queue reconciliation, and audit-evidence retention.
- Independent security review and successful acceptance tests above.

Until these gates are met, describe the feature as a controlled document workflow under pilot—not as certified, compliant, or equivalent to a bank records system.
