# AUDIT_PROMPT.md

## Prompt Audit Sistem untuk Codex / GPT-5.4

Gunakan prompt di bawah untuk minta Codex analisis sistem anda secara menyeluruh dari sudut kelemahan, bug, architecture, susunan fail, UI/UX, prestasi, dan kestabilan.

```text
Act as a senior software architect, performance engineer, security reviewer, and UX auditor.

I want you to analyze my full system/repository thoroughly and identify:

1. weaknesses in architecture
2. coding errors and likely bugs
3. runtime risks and edge-case failures
4. performance bottlenecks
5. heavy components or unnecessary dependencies
6. possible memory leaks
7. backend and frontend anti-patterns
8. UI/UX issues that may confuse users
9. file/folder structure problems
10. recommendations to make the system faster, lighter, more stable, and easier for clients to use

Your audit must cover:
- architecture
- backend
- frontend
- database
- API design
- state management
- performance
- security
- scalability
- maintainability
- UI/UX
- developer experience
- deployment readiness

## What I want you to do

Analyze the repository as if you are preparing it for production use by real clients.

Check for:
- broken logic
- error-prone code
- missing validation
- bad separation of concerns
- duplicated code
- routes mixed with business logic
- poor database patterns
- slow rendering
- large bundles
- unnecessary re-renders
- memory leaks
- missing cleanup in React hooks
- unoptimized WebSocket/event listeners
- unstable async flows
- bad loading/error states
- weak form UX
- poor navigation UX
- confusing screen hierarchy
- poor responsiveness
- accessibility issues
- heavy libraries that make the app slow
- possible API timeout problems
- missing retry/fallback logic
- improper logging
- missing global error handling
- rate limiting gaps
- security issues such as committed secrets, unsafe env usage, weak auth handling, poor input sanitization, insecure file upload, or unprotected endpoints

## Specific technical focus

### Architecture
Review whether the project has proper separation between:
- routes
- controllers
- services
- repositories
- database
- middleware
- utilities
- config

Tell me if the current structure is clean or messy.
Suggest a better folder structure if needed.

### Backend
Check for:
- bad Express patterns
- missing global error handler
- inconsistent response structure
- weak validation
- missing auth middleware
- poor query design
- database abstraction problems
- mixed database engines
- missing rate limiting
- bad logging
- unsafe async error handling

### Frontend
Check for:
- large components doing too much
- poor state management
- prop drilling
- poor loading/error/empty states
- memory leaks in useEffect
- listeners not cleaned up
- unnecessary re-renders
- huge bundle contributors
- poor lazy loading
- bad route structure
- weak form UX
- poor component reuse
- inconsistent design patterns

### UI/UX
Audit the system from the perspective of a real client using it daily.

Identify:
- confusing flows
- too many clicks
- unclear labels
- weak visual hierarchy
- bad spacing/layout
- responsiveness issues
- inaccessible interactions
- poor feedback after actions
- weak onboarding experience
- hard-to-find important actions
- friction points that may cause users to abandon tasks

Then propose practical UI/UX improvements.

### Performance
Check for:
- heavy dependencies
- unnecessary libraries
- duplicate libraries
- unoptimized charts/tables/lists
- no virtualization where needed
- oversized assets
- no code splitting
- bad caching strategy
- repeated API calls
- expensive renders
- poor memoization
- memory leaks
- unbounded intervals/timeouts/listeners

### Stability
Find likely causes of:
- crashes
- blank screens
- hanging requests
- stale state
- websocket issues
- race conditions
- timeout failures
- bad retry loops
- unhandled promise rejections

## Output format

Give the final answer in this exact structure:

1. Executive Summary
2. Critical Issues
3. Bugs / Likely Errors Found
4. Architecture Review
5. File/Folder Structure Review
6. Backend Review
7. Frontend Review
8. UI/UX Review
9. Performance Review
10. Memory Leak / Stability Risks
11. Security Review
12. Dependency Audit
13. Recommended Folder Structure
14. Priority Fix Roadmap
15. Quick Wins
16. Long-Term Improvements

## Important rules

- Be brutally honest but practical.
- Do not give generic advice.
- Base your analysis on the actual repository structure and code.
- Point to exact files/components/modules when possible.
- Explain why each issue matters.
- For every problem, suggest a concrete fix.
- Prioritize issues by severity:
  - Critical
  - High
  - Medium
  - Low
- Highlight anything that may affect client experience directly.
- Focus on making the system:
  - fast
  - light
  - stable
  - secure
  - easy to use
  - easy to maintain
  - production-ready

If you detect likely memory leaks, clearly explain:
- where they may happen
- why they may happen
- how to fix them

If you detect poor UI/UX, explain:
- what users will struggle with
- why it creates friction
- how to redesign it simply

If you detect architecture problems, propose a cleaner structure with examples.

At the end, provide:
- Top 10 fixes to do first
- a 7-day improvement plan
- a 30-day stabilization plan
```

## Arahan tambahan yang bagus untuk elak jawapan generik

```text
Do not give generic advice.
Inspect actual files and code patterns before concluding.
If you are unsure, say "possible issue" instead of pretending certainty.
Prefer precise file-level findings over general best practices.
```

## Versi audit + cadangan refactor

```text
Analyze this repository deeply and act like a senior architect preparing it for production.

Tasks:
1. audit the full codebase
2. identify bugs, weak logic, and risky patterns
3. identify performance issues and memory leak risks
4. identify architecture and file structure problems
5. identify UI/UX friction points
6. identify security issues
7. propose concrete refactors
8. suggest exact file-level improvements
9. recommend dependency cleanup
10. suggest production hardening steps

For every issue:
- give severity
- explain impact
- explain root cause
- suggest exact fix
- mention affected files if visible

Also evaluate:
- client usability
- app speed
- bundle weight
- maintainability
- scalability
- readiness for production

Then produce:
- executive summary
- detailed findings
- recommended new folder structure
- top 10 fixes
- quick wins
- phased roadmap
- optional refactor patches
```

## Cara guna

1. Buka Codex / GPT-5.4.
2. Tampal prompt utama di atas.
3. Jika repo besar, tambah arahan ini di bahagian paling atas:

```text
First, scan the repository and summarize:
- project structure
- frontend stack
- backend stack
- database usage
- major risk areas
Then perform the full audit.
```

4. Jika mahu hasil lebih tepat, minta juga:
   - cari memory leak
   - audit bundle size
   - audit UI/UX flow
   - semak architecture backend
   - semak security issue

## Tujuan fail ini

Fail ini direka supaya AI tidak sekadar beri nasihat rawak, tetapi benar-benar audit repo macam engineer yang sedang bersihkan sistem production. Benda kecil nampak remeh, tapi benda kecil selalu jadi bom jangka dalam sistem. Perisian itu suka berlakon stabil sebelum dia meletup.
