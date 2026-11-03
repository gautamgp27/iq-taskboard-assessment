// @vitest-environment node
// Part 2 starter — do not modify the test descriptions or setup
// Requires the dev server running on http://localhost:3000

import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  const data = (await res.json()) as { token: string };
  return data.token;
}

let tokens: { meera: string; arjun: string; dev: string };
let projectId: string;
let taskId: string;

beforeAll(async () => {
  const [meera, arjun, dev] = await Promise.all([
    login("meera@taskboard.dev"),
    login("arjun@taskboard.dev"),
    login("dev@example.com"),
  ]);
  tokens = { meera, arjun, dev };

  const projectsRes = await fetch(`${BASE_URL}/api/projects`, {
    headers: { Authorization: `Bearer ${meera}` },
  });
  const { projects } = (await projectsRes.json()) as {
    projects: { id: string; name: string }[];
  };
  projectId = projects.find((p) => p.name === "Q3 Launch")!.id;

  const tasksRes = await fetch(`${BASE_URL}/api/projects/${projectId}/tasks`, {
    headers: { Authorization: `Bearer ${meera}` },
  });
  const { tasks } = (await tasksRes.json()) as { tasks: { id: string }[] };
  taskId = tasks[0].id;
});

describe("task access control", () => {
  // Test A
  it("a viewer cannot update a task", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokens.dev}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "viewer update attempt" }),
    });
    expect(res.status).toBe(403);
  });

  // Test B
  it("a viewer cannot create a task", async () => {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.dev}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "viewer create attempt" }),
    });
    // A viewer is authenticated but lacks permission, so the correct status is
    // 403 (Forbidden), not 401 (Unauthorized). The test asserted the wrong code.
    expect(res.status).toBe(403);
  });

  // Test C
  it("a member can create a task", async () => {
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.arjun}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "member create — baseline" }),
    });
    expect(res.status).toBe(201);
  });
});

// Added by candidate — scenarios not covered by the provided tests.
// These reinforce the 401-vs-403 distinction and guard the PATCH authz fix.
describe("task access control — additional coverage", () => {
  // Test D: a genuinely unauthenticated request (no token) is the real 401 case,
  // in contrast to the viewer's 403. Non-mutating: rejected before any write.
  it("an unauthenticated request cannot update a task (401)", async () => {
    const res = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "no-token update attempt" }),
    });
    expect(res.status).toBe(401);
  });

  // Test E: a user who is not a member of the task's project is authenticated
  // but forbidden (403). lina@example.com is not a member of Q3 Launch.
  // This is the broader version of the PATCH access-control bug.
  it("a non-member cannot update a task (403)", async () => {
    const lina = await login("lina@example.com");
    const res = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${lina}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "non-member update attempt" }),
    });
    expect(res.status).toBe(403);
  });
});
