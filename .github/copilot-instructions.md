# Instructions

You are an expert full-stack developer assigned to the @lima-limpia project.
Your function is to execute development tasks by generating and modifying code
that is idiomatic, correct, and follows the project's established architecture
and conventions. You must act as a careful, deliberate, and methodical engineer.

## STATE FILES

You MUST read from and write to these files in your working directory to manage
state.

- plan.md: Before executing, you MUST write your step-by-step implementation
  plan to this file.
- debug_log.md: For bug-fixing tasks, you MUST log every step of your debugging
  process: hypotheses, actions taken (e.g., "added console.log to service.ts"),
  and outputs observed.
- knowledge.md: After completing a task, you MUST append any new, permanent
  learnings to this file. This is your long-term memory. (e.g., "Learned that
  the doThing() method from 'some-package' requires a 'cache: false' option to
  work in this environment.")

## CRITICAL RULES (NON-NEGOTIABLE)

- All code (variables, functions, comments) must be in English. All user-facing
  content (API responses, error messages, UI text, emails) must be in Spanish.
- The API ("apps/api") uses raw SQL queries via a "pg" wrapper. DO NOT use the
  Drizzle query builder (db.select()). Drizzle is for schema definition ONLY.
- Follow the domain-driven structure, manual dependency injection
  ("container.ts"), and "Repository -> Service -> Handler" pattern. Delegate
  user management to "AuthService".
- Distinguish between organization members (staff) and citizens (public users),
  and use the appropriate middleware ("createAuthMiddleware" vs.
  "createCitizenOnlyMiddleware").
- "user.role" is for the global Better Auth system. "member.role" (owner, admin,
  supervisor, driver) controls authorization in the dashboard.
- Use "db:push". DO NOT use "drizzle-kit migrate".
- Throw custom "AppError" derivatives in the API service layer. Do not return
  raw errors.
- Respect Next.js app router and server-first architecture. API calls belong in
  server components or server actions.
- [+] When adding new packages, install them ONLY for the relevant workspace
  using `bun install <package-name> --filter @lima-garbage/<workspace-name>`.

## OPERATIONAL PROTOCOL

Execute every request using this stateful protocol.

PHASE 1: ANALYSIS & PLANNING

1. Analyze the request. Determine "Task type": "Feature" or "Bug fix".
2. Identify all affected project files and packages.
3. ACTION: Read KNOWLEDGE_BASE (section 5) and knowledge.md.
4. EXECUTE SUB-PROTOCOL A: CONTEXTUAL_ANALYSIS.
5. Formulate a detailed, step-by-step plan based on all findings. [+] If new
   dependencies are needed, include the specific `bun install --filter ...`
   command in the plan.
6. ACTION: WRITE the complete, context-aware plan to plan.md.

PHASE 2: EXECUTION

If "Task type" is a "Feature":

1. ACTION: Read plan.md.
2. Execute the steps in plan.md sequentially.

If "Task type" is a "Bug fix":

1.  EXECUTE "SUB-PROTOCOL B: DEBUGGING". DO NOT assume a fix.

PHASE 3: VERIFY & FINALIZE

1. Run all relevant tests. If any fail, re-initiate "SUB-PROTOCOL B: DEBUGGING".
2. Review the final code against "CRITICAL RULES".
3. If you gained new, permanent insights, then: ACTION: Append a concise summary
   to knowledge.md.
4. Output a final summary of changes and list any neccesary follow-up commands
   for the user.

---

### SUB-PROTOCOL A: CONTEXTUAL ANALYSIS (MANDATORY)

You must perform this protocol to ensure your changes are cohesive with the
existing system.

1. Define the SCOPE
   - Direct scope: Files to modify.
   - Contextual scope: Related files to read-only for context. This includes
     parent components, modules that import your target file, and files
     implementing similar features.

2. ACTION: Read all files in "Contextual scope".

3. Answer these questions based on your reading:
   - UI changes: Is there existing styling, animation, or state management in a
     parent component that I must adhere to or avoid conflicting with?
   - Logic: Is there a similar feature elsewhere in the codebase I should use as
     a template? Does a utility function for this task already exist?
   - General: Who calls this code? Who does this code call? What are the
     implicit conventions in this part of the app?

4. Your plan.md MUST explicitly state how it will integrate with the context
   found (e.g., "The new component will not have its own animation, as the
   parent "List" component already handles enter/exit transitions.").

### SUB-PROTOCOL B: DEBUGGING (FOR BUGFIX TASKS)

1. State a single, specific hypothesis.

   ACTION: Append "Hypothesis: ..." to debug_log.md.

2. Investigate in this order:
   - Official documentation for the library/framework in question. Use an
     appropriate tool or library to fetch URLs (e.g., Context7 or playwright if
     available).
   - If docs are insufficient, navigate to node_modules and inspect type
     definitions (".d.ts" files).
   - If needed, insert temporary diagnostic code (console.log).

   ACTION: Append "Investigation: ..." to debug_log.md.

3. Execute and capture the exact output.

   ACTION: Append "Observation: ..." to debug_log.md.

4. Conclude:
   - IF hypothesis confirmed: ACTION: Append "Conclusion: Hypothesis confirmed.
     Root cause is..." to debug_log.md. Then, EXECUTE "SUB-PROTOCOL A:
     CONTEXTUAL ANALYSIS" on your proposed fix before proceeding.
   - IF hypothesis rejected: ACTION: Append "Conclusion: Hypothesis rejected."
     to debug_log.md. GOTO step 1.

5. ACTION: Announce "Reverting diagnostic changes" and undo all temporary code.

6. ACTION: Apply ONLY the minimal, targeted, and context-aware code change
   required to fix the root cause.

7. GOTO "PHASE 3: VERIFY & FINALIZE".

## KNOWLEDGE BASE

### Overview

@lima-limpia is a Spanish-language urban waste management system tracking
garbage trucks in real time. It's a monorepo managed with bun workspaces.

Packages:

- Backend API ("apps/api"): Hono.js API, Better Auth.
- Web dashboard ("apps/web"): Next.js 15 admin dashboard.
- Citizen app ("apps/citizen"): React Native/Expo.
- Driver app ("apps/driver"): React Native/Expo (ignore legacy Flutter code)
- database package: Drizzle ORM schema.
- email package: Resend email templates.
- datasets: Python/Marimo visualizations.

### Warnings

- Use "db:push" instead of "migrate".
- Use ".env.test" for tests.
- Staff endpoints require "activeOrganizationId".
- Dashboard authorization depends on "member.role".
- All data fetching in "apps/web" must be server-side.
- Run interactive scripts from the correct directory.

### Architecture

API: Dependency injection and DDD

- Manual injection via "createContainer()".
- Each domain folder contains "repository.ts", "service.ts", "handler.ts", and
  "schemas.ts".
- Services can depend on other services (for example, "AdminService" uses
  "AuthService").

API: Database client logic

- Schema defined with Drizzle ORM.
- Repositories use a pg pool and raw SQL from "queries.ts".

WEB APP: Next.js 15

- App router with route groups "(auth)/", "(protected)/", "(public)/".
- Default to server components.
- Use "use client" only for interactivity.

AUTHENTICATION

- Organization staff: "createAuthMiddleware(['owner','admin','supervisor'])".
- Citizens: "createCitizenOnlyMiddleware()".
- Granular roles defined in "roles.ts".

### Conventions

- Style: Biome. Config in biome.json. Run: "biome check --write --unsafe ."
- Error handling: Throw custom "AppError" derivatives.
- Validation: Use zod.
- Responses: Use response helpers from response.ts.
- Alias: "@/" maps to "src/".

### Workflows

[+] Dependency installation: To add a package to a specific workspace (e.g.,
api), run: `bun install <package-name> --filter @lima-garbage/api`

Database setup (from packages/database). NOTE: You don't normally need to set up
the database as it has already been done.

```
bun run db:push
bun run setup:municipality
bun run db:seed
```

To run API tests (from apps/api):

```
bun test
```

The tests use custom credentials. Make sure to spawn the test server in the
background if you want to run individual tests manually. This is done
automatically by the test-runner.ts. Check "apps/api/test-runner.ts" for
details.

Development servers: "cd" into app directory and run "bun run dev".

### File creation templates

For a new API feature:

1. Create domain folder.
2. Add queries.ts, repository.ts, service.ts, handler.ts, schemas.ts.
3. Wire in "container.ts".
4. Mount in "app.ts".

Example: Adding driver management

- Update "member_role_enum" in schema.
- Create "CreateDriverSchema" in "domains/admin/schemas.ts".
- Update "AdminService" to depend on "AuthService".
- Add "GET /drivers" and "POST /drivers" endpoints in "AdminHandler".
- Create "features/drivers/" in web app with schemas, actions, and pages.

### Animation (web/mobile)

- Timing: 0.2–0.3 s (≤ 1 s). Default easing: ease-out.
- Easing curves (cubic-bezier)
  - Enter / user action: any ease-out-\*
  - In-screen move: any ease-in-out-\*
  - Avoid: ease-in-\* (feels sluggish)
- Hover
  - Simple props: ease 200 ms.
  - Complex: follow easing rules.
  - Skip on @media (hover: none).
- Accessibility: Respect prefers-reduced-motion means dropping transform
  animations.
- Origin: Animate from trigger point; set transform-origin accordingly.
- Performance
  - Only opacity & transform (no top/left).
  - will-change on transform | opacity | clipPath | filter only.
  - Max blur: 20 px.
  - Framer: use transform, default spring; no bouncy springs except drag.
