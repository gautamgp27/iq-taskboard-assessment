# TEST_OUTPUT.md — Part 2

Command: `npm test` (vitest, hits the dev server on http://localhost:3000)

## Before fixes

Two tests fail:
- `a viewer cannot update a task` — expected 403, received 200 (code wrong: PATCH /api/tasks/:id had no authorization check).
- `a viewer cannot create a task` — expected 401, received 403 (test wrong: a viewer is authenticated but forbidden, so 403 is correct).

```

> taskboard@0.1.0 test
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.8 /Users/gautampandey/Desktop/Gautam_Syfe_Workspace/iq-taskboard-assessment

 ❯ src/tests/part2.test.ts (3 tests | 2 failed) 1906ms
   × task access control > a viewer cannot update a task 275ms
     → expected 200 to be 403 // Object.is equality
   × task access control > a viewer cannot create a task 252ms
     → expected 403 to be 401 // Object.is equality

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/tests/part2.test.ts > task access control > a viewer cannot update a task
AssertionError: expected 200 to be 403 // Object.is equality

- Expected
+ Received

- 403
+ 200

 ❯ src/tests/part2.test.ts:57:24
     55|       body: JSON.stringify({ title: "viewer update attempt" }),
     56|     });
     57|     expect(res.status).toBe(403);
       |                        ^
     58|   });
     59| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/tests/part2.test.ts > task access control > a viewer cannot create a task
AssertionError: expected 403 to be 401 // Object.is equality

- Expected
+ Received

- 401
+ 403

 ❯ src/tests/part2.test.ts:70:24
     68|       body: JSON.stringify({ title: "viewer create attempt" }),
     69|     });
     70|     expect(res.status).toBe(401);
       |                        ^
     71|   });
     72| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
   Start at  21:40:35
   Duration  2.41s (transform 24ms, setup 89ms, collect 9ms, tests 1.91s, environment 0ms, prepare 63ms)

```

## Fixes applied

1. **Code** — `src/app/api/tasks/[id]/route.ts` (PATCH): added the membership + role check (`getProjectMembership` → 403 if not a member; `canEditTasks` → 403 for viewers), mirroring the existing DELETE handler. This is the valid bug the first test was proving, so the test was left unchanged.
2. **Test** — `src/tests/part2.test.ts` (Test B): changed the asserted status from 401 to 403. The viewer is authenticated, so 403 (Forbidden) is the semantically correct status; 401 (Unauthorized) is for missing/invalid credentials. Description and setup were not modified.
3. **Added tests** — `task access control — additional coverage`: Test D (unauthenticated PATCH → 401, the genuine authentication failure) and Test E (non-member PATCH → 403, the broader form of the access-control bug).

## After fixes

```

> taskboard@0.1.0 test
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.8 /Users/gautampandey/Desktop/Gautam_Syfe_Workspace/iq-taskboard-assessment

 ✓ src/tests/part2.test.ts (5 tests) 2928ms
   ✓ task access control > a viewer cannot update a task 336ms
   ✓ task access control — additional coverage > a non-member cannot update a task (403) 596ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  21:41:26
   Duration  3.67s (transform 27ms, setup 87ms, collect 10ms, tests 2.93s, environment 0ms, prepare 109ms)

```
