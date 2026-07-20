# Design Decisions

These records explain choices that should remain intentional as the library evolves.

## 001 — Keep the core headless

**Decision:** The package owns learning, content, and storage protocols but no UI, design tokens, assets, product language, analytics, or hosting.

**Why:** Learning mechanics can be reused across law, civil-service, language, professional, and internal exams without leaking one product's identity or forcing a framework.

**Consequence:** Applications provide their own question adapters and presentation layer. A framework adapter may exist later as a separate package, never as a runtime dependency of the core.

## 002 — Inject every source of policy and nondeterminism

**Decision:** Callers supply timestamps, random seeds or sources, scheduler configuration, checkpoint thresholds, adapters, and repositories.

**Why:** Identical inputs should produce identical plans and state transitions. This makes replay, migration, debugging, and tests reliable.

**Consequence:** The API is slightly more explicit, but domain rules do not hide in globals or clocks.

## 003 — Validate envelopes; keep payloads unknown

**Decision:** Content packages have a strict, versioned structural envelope. Item payloads remain `unknown` until an application-defined decoder accepts them.

**Why:** The engine cannot safely infer every subject's prompt and answer format. Structural success must not be mistaken for semantic or legal approval of content.

**Consequence:** Each adapter owns a payload type guard or schema and the rights to its content.

## 004 — Separate integrity from secrecy and authenticity

**Decision:** Archives use canonical JSON plus SHA-256 to detect modification. They do not claim encryption, authentication, signatures, or trust.

**Why:** Mislabeling a checksum as security would create a dangerous API. Stronger guarantees require application-specific keys, identities, and threat models.

**Consequence:** Sensitive archives need platform encryption and access control. Signed export formats should be introduced only as a separately versioned protocol.

## 005 — Prefer compensating restore over storage assumptions

**Decision:** Restore reads the current value, snapshots it, writes the replacement, and attempts rollback if the write fails.

**Why:** The generic repository contract cannot assume database transactions across browsers, native apps, files, and remote stores.

**Consequence:** The result reports rollback failure explicitly. Applications with real transactions may implement stronger semantics behind the same interface.

## 006 — Keep runtime dependencies at zero

**Decision:** The core uses standards-based platform APIs and ships no third-party runtime dependency.

**Why:** This reduces supply-chain surface, bundle cost, version conflicts, and legal review for downstream products.

**Consequence:** A new runtime dependency requires a documented design decision, license review, bundle impact, and security justification.
