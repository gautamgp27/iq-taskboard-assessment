# BUGS.md — TaskBoard top 4 findings (by business impact)

All four were reproduced against the running app (`http://localhost:3000`) using the curl commands below.

Setup used by every snippet:

```bash
B=http://localhost:3000
login(){ curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"password123\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }
M=$(login meera@taskboard.dev)      # admin on Q3 Launch
DEV=$(login dev@example.com)        # viewer on Q3 Launch only
LINA=$(login lina@example.com)      # NOT a member of Q3 Launch
P=$(curl -s $B/api/projects -H "Authorization: Bearer $M" | python3 -c 'import sys,json;print([p["id"] for p in json.load(sys.stdin)["projects"] if p["name"]=="Q3 Launch"][0])')
```

---

## 1. SQL injection in task search — Critical

- **File:** `src/app/api/projects/[id]/tasks/route.ts:27-34`
- **Category:** Security
- **Severity:** Critical

The `q` query parameter is interpolated directly into a SQL string and executed with `prisma.$queryRawUnsafe`. Any project member, including a read-only viewer, can break out of the `project_id` filter and read tasks from every project, and could extend this with `UNION` to read other tables such as `users`. A bare `'` returns HTTP 500, which confirms the input reaches the SQL parser unescaped. Fix: use `prisma.task.findMany` with `contains` and `mode: "insensitive"`, or a parameterised `$queryRaw` tagged template.

```bash
# dev@example.com belongs to Q3 Launch only
curl -s -G $B/api/projects/$P/tasks -H "Authorization: Bearer $DEV" --data-urlencode "q=launch"
#   -> 1 task, 1 project (expected)

curl -s -G $B/api/projects/$P/tasks -H "Authorization: Bearer $DEV" \
  --data-urlencode "q=zzz%') OR project_id IS NOT NULL --"
#   -> 12 tasks across 2 projects (every task in the database)

curl -s -o /dev/null -w "%{http_code}\n" -G $B/api/projects/$P/tasks \
  -H "Authorization: Bearer $DEV" --data-urlencode "q='"
#   -> 500
```

---

## 2. Password hashes returned by the project detail API — Critical

- **File:** `src/app/api/projects/[id]/route.ts:25-40` (`owner: true`, `memberships: { include: { user: true } }`, `assignee: true`, `createdBy: true`)
- **Category:** Security
- **Severity:** Critical

`GET /api/projects/:id` includes the full `User` rows instead of selecting safe fields, so the response contains every member's `passwordHash` (bcrypt). Any member, even a viewer, receives the hashes of the owner and all other members, which allows offline cracking. The sibling routes already show the correct pattern (`select: { id, name, email }`). Fix: replace each `true` / `include: { user: true }` with an explicit `select`.

```bash
curl -s $B/api/projects/$P -H "Authorization: Bearer $DEV" | python3 -c '
import sys,json
p=json.load(sys.stdin)["project"]
print("owner keys:", sorted(p["owner"]))
print("member hashes exposed:", sum("passwordHash" in m["user"] for m in p["memberships"]), "of", len(p["memberships"]))'
#   -> owner keys include passwordHash; 4 of 4 member hashes exposed
```

---

## 3. No authorization check on task update (PATCH) — High

- **File:** `src/app/api/tasks/[id]/route.ts:16-38`
- **Category:** Security (broken access control)
- **Severity:** High

`PATCH /api/tasks/:id` only checks that the caller is logged in. It never looks up the task's project or the caller's membership and role, unlike `DELETE` in the same file (lines 49-53). A user who is not a member of the project, and a viewer, can rename tasks, change status or reassign them. This also breaks the viewer-is-read-only rule. Fix: load the task, call `getProjectMembership(user.id, existing.projectId)`, return 403 if missing, and require `canEditTasks(role)`.

```bash
TID=$(curl -s $B/api/projects/$P/tasks -H "Authorization: Bearer $M" | python3 -c 'import sys,json;print(json.load(sys.stdin)["tasks"][0]["id"])')

# lina is not a member: reading the project is correctly blocked...
curl -s -o /dev/null -w "%{http_code}\n" $B/api/projects/$P -H "Authorization: Bearer $LINA"      # 403
# ...but she can still modify its tasks
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH $B/api/tasks/$TID \
  -H "Authorization: Bearer $LINA" -H 'Content-Type: application/json' -d '{"title":"hijacked"}'   # 200 (expected 403)
```

(During verification the PATCH body re-sent the task's existing title, so no data changed.)

---

## 4. Duplicate / impersonating accounts allowed (no unique email) — High

- **File:** `prisma/schema.prisma:25` (`email String` with no `@unique`); `src/app/api/auth/register/route.ts:17-25` (check-then-insert); login uses `findFirst` at `src/app/api/auth/login/route.ts:16`
- **Category:** Data Integrity
- **Severity:** High

Email uniqueness is enforced only by an application-level `findFirst` before `create`, with nothing in the database behind it. Five parallel registrations of the same email all succeeded, producing five rows. Matching is also case-sensitive, so `MEERA@taskboard.dev` registers as a separate account from `meera@taskboard.dev`. With duplicates, `findFirst` at login returns an arbitrary row, so which account a user lands in is non-deterministic. Fix: add `@unique` on a normalised (lower-cased) email, normalise in the schema (`.toLowerCase()`), and handle Prisma `P2002` as a 409/400.

```bash
E="race.$(date +%s)@example.com"
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code} " -X POST $B/api/auth/register \
  -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"password123\",\"name\":\"Race\"}" & done; wait
#   -> 201 201 201 201 201
psql -d taskboard -tAc "select count(*) from users where email='$E'"      # -> 5

curl -s -X POST $B/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"MEERA@taskboard.dev","password":"password123","name":"Impostor"}'   # -> 201, new account
```

(Test rows were deleted afterwards. Seed data was not modified.)

---

### Also noted (not in the top 4)

- **Performance:** `src/app/api/projects/route.ts:16` loads every task row of every project just to compute `taskCount`. `_count` would avoid this.
- **UI:** When a viewer opens a project, the app still shows "add a task" and "delete task". The error only appears after the click (`src/app/projects/[id]/page.tsx:96`, `src/components/TaskDetail.tsx`).
- **Data integrity:** New-task position is `max + 1` without a transaction (`tasks/route.ts:67-81`), so concurrent creates can share a position.
