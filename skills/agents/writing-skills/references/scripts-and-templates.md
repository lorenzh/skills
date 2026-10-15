# Scripts and Templates

Choose a resource from observed work, then give it a checkable contract.
All reviews and fixes spend the core's global budget.

## Scripts

A script earns its place through determinism, fragility, capability, or repeated helper code.
If the rule needs only the open file and one sentence, keep it in prose.
If an existing helper does the work, use it.
Use the repository's runtime and standard library before adding dependencies.
State the runtime requirement in the project's requirements documentation.
Discover project directories; use placeholders for machine-specific paths.

1. Define the script contract.

   Name its inputs, output, runtime, and failure behavior in the skill.
   Give the pointer an exact command and arguments.
   Say “run” for execution; say “read” only when source code is the reference.
   Include usage output through `--help`.
   Use exit 0 for success, 1 for a blocking failure, and 2 for incorrect invocation.
   If another program consumes output, provide structured output such as `--json`.
   If the runtime can be absent, name the manual fallback or explicit blocked state.
   Done when the command, runtime, output, exit meanings, and fallback appear in the skill.

2. Test the script deterministically.

   Cover one ordinary input, each observed defect, and incorrect invocation.
   Pin fixtures to expected outputs; assert exit status and resulting files.
   Use a test runner rather than a model verdict.
   If an invariant template contains executable code, test that code too.
   Add deterministic checks to existing continuous integration when that configuration is in scope.
   State enforced rules in prose; keep each threshold authoritative in one place.
   Done when the test command exits successfully and its output identifies the checked cases.

## Templates

1. Choose the template type.

   Use a slot template when the artifact needs required sections.
   Use a verbatim template when fixed content must remain identical.
   Use a seed template when the user will extend a copied starting file.
   Done when the authoring record names the type and the later reader.

2. Write the template contract.

   Put each slot's rule inside the slot: `<Risk: name the affected user and quote the evidence>`.
   For a verbatim template, provide a copy command and mark fixed content separately from editable slots.
   For a seed template, name the placeholders that must be replaced.
   Start new skills from `templates/SKILL.md.tmpl` in this bundle.
   Preserve `{{name}}` and `{{title}}` in that scaffold source.
   Done when each slot carries its rule and each fixed section has an explicit copying requirement.

3. Check the filled artifact.

   Have the consuming step read the actual output file.
   Block completion on required slots that remain unresolved.
   For a verbatim template, compare fixed content with the source.
   Done when the filled artifact contains all required slots and preserves every fixed section.
