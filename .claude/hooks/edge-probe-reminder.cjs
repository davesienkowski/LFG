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

  const kind = /SPEC\.md$/i.test(fp) ? "SPEC" : "PLAN";
  const reminder = [
    `EDGE-PROBE GATE — a ${kind}.md was just written (${fp}).`,
    `Before execution, run the edge-probe FAMILY for this phase and resolve every applicable finding:`,
    `  1. edge-probe (deterministic): build [{"id":"<REQ-ID>","text":"<requirement>"}] from this phase's requirements and run:`,
    `       node ~/.claude/gsd-core/bin/lib/edge-probe.cjs <reqs.json>`,
    `     Treat 'unclassified' rows as must-NOT requirements the shape taxonomy can't see.`,
    `  2. prohibition-probe (manual): ask of this phase's gate — "What could this silently become that the author would NOT want, but the spec does not forbid?" Source-verify each candidate (trust-but-verify).`,
    `  3. Fold real findings into the plan (gap items / must_haves) or verifier checks. Do NOT start execution until every applicable edge is resolved or dismissed with a source-backed reason.`,
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
