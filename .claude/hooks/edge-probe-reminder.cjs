#!/usr/bin/env node
/**
 * edge-probe reminder hook (PostToolUse: Write|Edit)
 *
 * When a phase SPEC.md or PLAN.md is created/edited under .planning/, remind the
 * agent to run the edge-probe FAMILY at the spec/plan boundary and to verify the
 * findings are closed before execution. This is a *reminder only* — the probing
 * itself is analytical work the agent performs (see the project memory
 * "edge-probe-at-spec-and-plan").
 *
 * Mechanism: read the hook payload on stdin, inspect the written file path, and
 * if it is a SPEC.md or PLAN.md, emit additionalContext back to the session.
 */
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let fp = "";
  try {
    const payload = JSON.parse(raw || "{}");
    fp = (payload.tool_input && payload.tool_input.file_path) || "";
  } catch {
    process.exit(0);
  }

  const isSpecOrPlan =
    /\.planning\//.test(fp) && /(SPEC|PLAN)\.md$/i.test(fp);
  if (!isSpecOrPlan) process.exit(0);

  // Recognize the SPEC variants distinctly: UI-SPEC and AI-SPEC are design
  // contracts with their own requirements/acceptance criteria — they get the
  // edge-probe family too, not just the plain phase SPEC and PLAN.
  const kind = /UI-SPEC\.md$/i.test(fp)
    ? "UI-SPEC"
    : /AI-SPEC\.md$/i.test(fp)
      ? "AI-SPEC"
      : /SPEC\.md$/i.test(fp)
        ? "SPEC"
        : "PLAN";
  // Policy (project memory: edge-probe-at-spec-and-plan):
  //  - PLAN / SPEC / AI-SPEC → FULL family (deterministic engine + prohibition-probe)
  //  - UI-SPEC → prohibition-probe ONLY; skip the engine unless the UI contract
  //    introduces genuinely NEW data shapes (e.g. a sort/filter ordering).
  //  - Never re-probe edges already covered/dismissed upstream — only what this doc adds.
  const uiOnly = kind === "UI-SPEC";
  const reminder = uiOnly
    ? [
        `EDGE-PROBE GATE — a ${kind}.md was just written (${fp}).`,
        `Per policy, UI-SPEC gets the PROHIBITION-PROBE ONLY (skip the deterministic engine UNLESS this UI contract introduces genuinely new data shapes, e.g. a sort/filter ordering — then run the full edge-probe too):`,
        `  1. prohibition-probe (manual): for the NEW UI behaviors this contract adds, ask — "What could this UI silently become that the author would NOT want, but the contract does not forbid?" (e.g. false success feedback, a credential shown without its warning).`,
        `  2. Do NOT re-probe edges/prohibitions already covered or dismissed in this phase's SPEC.md — only probe what the UI layer adds.`,
        `  3. Fold real findings into the plan (must_haves / acceptance) before execution.`,
        `  Refs: ~/.claude/gsd-core/references/{prohibition-probe,domain-probes}.md`,
      ].join("\n")
    : [
        `EDGE-PROBE GATE — a ${kind}.md was just written (${fp}).`,
        `Before execution, run the FULL edge-probe family for this phase and resolve every applicable finding:`,
        `  1. edge-probe (deterministic): build [{"id":"<REQ-ID>","text":"<requirement>"}] from this phase's NEW requirements and run:`,
        `       node ~/.claude/gsd-core/bin/lib/edge-probe.cjs <reqs.json>`,
        `     Treat 'unclassified' rows as must-NOT requirements the shape taxonomy can't see.`,
        `  2. prohibition-probe (manual): ask of this phase's gate — "What could this silently become that the author would NOT want, but the spec does not forbid?" Source-verify each candidate (trust-but-verify).`,
        `  3. Do NOT re-probe edges already covered/dismissed upstream (SPEC) — only probe what this doc adds. Fold real findings into the plan (must_haves) or verifier checks. Do NOT start execution until every applicable edge is resolved or dismissed with a source-backed reason.`,
        `  Refs: ~/.claude/gsd-core/references/{edge-probe,prohibition-probe,domain-probes}.md`,
      ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: reminder,
      },
    })
  );
  process.exit(0);
});
