import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Harness } from "./harness";

const h = new Harness();

// people
const E = (n: string) => `${n}@test.local`;
const U: Record<string, { id: number; email: string }> = {};
// ids
let orgA = 0, orgB = 0, g1 = 0, g2 = 0, g3 = 0, gB = 0;
let docTeacher = 0, docIndie = 0, docAdminOrg = 0;
let codeG1 = "";

const ok = (res: { status: number; body: any }, ...statuses: number[]) =>
  assert.ok(statuses.includes(res.status), `expected ${statuses.join("/")} got ${res.status}: ${JSON.stringify(res.body)}`);
const searchIds = async (as: string, query: string, headers: Record<string, string> = {}) => {
  const res = await h.call("GET", `/api/documents/search?query=${encodeURIComponent(query)}`, as, undefined, headers);
  ok(res, 200);
  return new Set<number>((res.body.results ?? res.body ?? []).map((r: any) => r.document?.id ?? r.documentId));
};
const listIds = async (as: string, headers: Record<string, string> = {}) => {
  const res = await h.call("GET", "/api/documents", as, undefined, headers);
  ok(res, 200);
  return new Set<number>(res.body.map((d: any) => d.id));
};

describe("organizations, groups and document access", () => {
  before(async () => {
    await h.start();
    // Independent accounts, created through the real public registration endpoint.
    for (const n of ["adminA", "teacher1", "teacher2", "student1", "student2", "student3", "adminB", "teacherB", "studentB", "indie", "newcomer"]) {
      U[n] = await h.register(n, E(n));
    }
    U.platform = await h.platformAdmin(E("platform"));
  });
  after(async () => { await h.stop(); });

  // -------------------------------------------------------------------------
  describe("independent users (no organization)", () => {
    it("registers and logs in as a student with zero memberships", async () => {
      const me = await h.call("GET", "/api/auth/me", E("indie"));
      ok(me, 200);
      assert.equal(me.body.user.role, "STUDENT");
      assert.deepEqual((await h.call("GET", "/api/organizations/mine", E("indie"))).body, []);
      assert.equal(await h.prisma.organizationMembership.count(), 0, "no membership is ever created implicitly");
      assert.equal(await h.prisma.organization.count(), 0, "no organization is created per student");
    });

    it("cannot self-assign a role on registration", async () => {
      const res = await h.call("POST", "/api/auth/register", undefined, { name: "x", email: E("evil"), password: "Password123!", role: "ADMIN" });
      ok(res, 400);
    });

    it("has the full personal AI toolset without an organization (compare/insights are not role-gated)", async () => {
      docIndie = await h.document(U.indie.id, "Indie notes", "photosynthesis converts sunlight into chemical energy");
      const other = await h.document(U.indie.id, "Indie notes 2", "mitochondria produce energy for the cell");
      assert.ok((await listIds(E("indie"))).has(docIndie));
      assert.ok((await searchIds(E("indie"), "photosynthesis")).has(docIndie));
      // Previously TEACHER/ADMIN only: a student must now get past authorization (404/200/5xx from the LLM, never 403).
      const cmp = await h.call("POST", "/api/documents/compare", E("indie"), { documentIdA: docIndie, documentIdB: other });
      assert.notEqual(cmp.status, 403);
      const coll = await h.call("POST", "/api/intelligence/collection", E("indie"), { documentIds: [docIndie, other] });
      assert.notEqual(coll.status, 403);
      const many = await h.call("POST", "/api/intelligence/compare", E("indie"), { documentIds: [docIndie, other] });
      assert.notEqual(many.status, 403);
    });

    it("existing login, wrong-password and profile endpoints still work", async () => {
      ok(await h.login(E("indie")), 200);
      const bad = await h.call("POST", "/api/auth/login", undefined, { email: E("indie"), password: "nope-nope-nope" });
      ok(bad, 401);
    });
  });

  // -------------------------------------------------------------------------
  describe("tenant setup and isolation", () => {
    it("only a platform admin can create organizations", async () => {
      ok(await h.call("POST", "/api/admin/organizations", E("adminA"), { name: "Nope" }), 403);
      const a = await h.call("POST", "/api/admin/organizations", E("platform"), { name: "Alpha University", organizationType: "UNIVERSITY", adminEmail: E("adminA") });
      ok(a, 201);
      assert.equal(a.body.adminAdded, true);
      orgA = a.body.id;
      const b = await h.call("POST", "/api/admin/organizations", E("platform"), { name: "Beta School", adminEmail: E("adminB") });
      ok(b, 201);
      orgB = b.body.id;
    });

    it("platform admin status gives NO automatic access to tenant data", async () => {
      ok(await h.call("GET", `/api/organizations/${orgA}`, E("platform")), 404);
      ok(await h.call("GET", `/api/organizations/${orgA}/members`, E("platform")), 404);
      ok(await h.call("GET", `/api/organizations/${orgA}/stats`, E("platform")), 404);
    });

    it("admins add existing accounts with organization-scoped roles", async () => {
      for (const [n, role] of [["teacher1", "TEACHER"], ["teacher2", "TEACHER"], ["student1", "STUDENT"], ["student2", "STUDENT"]] as const) {
        ok(await h.call("POST", `/api/organizations/${orgA}/members`, E("adminA"), { email: E(n), role }), 201);
      }
      ok(await h.call("POST", `/api/organizations/${orgB}/members`, E("adminB"), { email: E("teacherB"), role: "TEACHER" }), 201);
      ok(await h.call("POST", `/api/organizations/${orgB}/members`, E("adminB"), { email: E("studentB"), role: "STUDENT" }), 201);
      // Being admin of A says nothing about B.
      ok(await h.call("POST", `/api/organizations/${orgB}/members`, E("adminA"), { email: E("student3"), role: "STUDENT" }), 404);
      // Duplicate membership is refused.
      ok(await h.call("POST", `/api/organizations/${orgA}/members`, E("adminA"), { email: E("teacher1"), role: "TEACHER" }), 409);
    });

    it("1+2. organization A cannot see organization B's people, groups or stats (and vice versa)", async () => {
      const gb = await h.call("POST", `/api/organizations/${orgB}/groups`, E("teacherB"), { name: "B Group" });
      ok(gb, 201);
      gB = gb.body.id;
      const aMembers = await h.call("GET", `/api/organizations/${orgA}/members`, E("adminA"));
      ok(aMembers, 200);
      const emails = aMembers.body.items.map((m: any) => m.email);
      assert.ok(emails.includes(E("teacher1")));
      assert.ok(!emails.includes(E("teacherB")) && !emails.includes(E("studentB")), "B's people leaked into A");
      for (const path of ["members", "stats", "groups", "students", "invitations", "audit-logs", "join-requests"]) {
        ok(await h.call("GET", `/api/organizations/${orgB}/${path}`, E("adminA")), 404);
        ok(await h.call("GET", `/api/organizations/${orgA}/${path}`, E("adminB")), 404);
      }
      ok(await h.call("GET", `/api/groups/${gB}`, E("adminA")), 404);
      ok(await h.call("PATCH", `/api/groups/${gB}`, E("adminA"), { name: "hijack" }), 404);
    });

    it("2. an administrator manages only their own organization (profile, code, logo, members)", async () => {
      ok(await h.call("PATCH", `/api/organizations/${orgA}`, E("adminB"), { name: "hijack" }), 404);
      ok(await h.call("PATCH", `/api/organizations/${orgA}`, E("teacher1"), { name: "teacher edit" }), 403);
      const res = await h.call("PATCH", `/api/organizations/${orgA}`, E("adminA"), { description: "Main campus", isDiscoverable: true });
      ok(res, 200);
      assert.equal(res.body.description, "Main campus");
      ok(await h.call("POST", `/api/organizations/${orgA}/join-code`, E("adminB")), 404);
    });
  });

  // -------------------------------------------------------------------------
  describe("groups, teachers and students", () => {
    it("3. a teacher can create multiple groups (and becomes lead of each)", async () => {
      const a = await h.call("POST", `/api/organizations/${orgA}/groups`, E("teacher1"), { name: "Biology 101", subject: "Biology" });
      const b = await h.call("POST", `/api/organizations/${orgA}/groups`, E("teacher1"), { name: "Chemistry 101", subject: "Chemistry" });
      const c = await h.call("POST", `/api/organizations/${orgA}/groups`, E("teacher1"), { name: "Physics 101" });
      ok(a, 201); ok(b, 201); ok(c, 201);
      g1 = a.body.id; g2 = b.body.id; g3 = c.body.id;
      const mine = await h.call("GET", `/api/organizations/${orgA}/groups`, E("teacher1"));
      assert.equal(mine.body.total, 3);
      assert.ok(mine.body.items.every((g: any) => g.teachers.some((t: any) => t.role === "LEAD_TEACHER")));
    });

    it("4+5. a group can have several teachers and a teacher can be assigned to several groups", async () => {
      ok(await h.call("POST", `/api/groups/${g1}/teachers`, E("teacher1"), { teacherId: U.teacher2.id, role: "CO_TEACHER" }), 201);
      ok(await h.call("POST", `/api/groups/${g2}/teachers`, E("adminA"), { teacherId: U.teacher2.id }), 201);
      const g = await h.call("GET", `/api/groups/${g1}`, E("teacher1"));
      assert.equal(g.body.teachers.length, 2);
      const t2 = await h.call("GET", `/api/organizations/${orgA}/groups`, E("teacher2"));
      assert.deepEqual(t2.body.items.map((x: any) => x.id).sort(), [g1, g2].sort(), "teacher2 sees exactly their assigned groups, not g3");
      // A co-teacher cannot hand out the lead role, edit the group, or rotate its code.
      ok(await h.call("POST", `/api/groups/${g1}/teachers`, E("teacher2"), { teacherId: U.teacher2.id, role: "LEAD_TEACHER" }), 403);
      ok(await h.call("PATCH", `/api/groups/${g1}`, E("teacher2"), { name: "renamed" }), 403);
      ok(await h.call("POST", `/api/groups/${g1}/join-code`, E("teacher2")), 403);
      // Teachers must be teachers of THIS organization.
      ok(await h.call("POST", `/api/groups/${g1}/teachers`, E("teacher1"), { teacherId: U.teacherB.id }), 400);
      ok(await h.call("POST", `/api/groups/${g1}/teachers`, E("teacher1"), { teacherId: U.student1.id }), 400);
    });

    it("6. a student can belong to several groups", async () => {
      ok(await h.call("POST", `/api/groups/${g1}/students`, E("teacher1"), { studentId: U.student1.id }), 201);
      ok(await h.call("POST", `/api/groups/${g2}/students`, E("teacher1"), { studentId: U.student1.id }), 201);
      const mine = await h.call("GET", `/api/organizations/${orgA}/my-groups`, E("student1"));
      assert.deepEqual(mine.body.map((g: any) => g.id).sort(), [g1, g2].sort());
    });

    it("students from other organizations (or non-students) cannot be added to a group", async () => {
      ok(await h.call("POST", `/api/groups/${g1}/students`, E("teacher1"), { studentId: U.studentB.id }), 400);
      ok(await h.call("POST", `/api/groups/${g1}/students`, E("teacher1"), { studentId: U.indie.id }), 400);
      ok(await h.call("POST", `/api/groups/${g1}/students`, E("teacher1"), { studentId: U.teacher2.id }), 400);
    });

    it("a student sees group details without the roster or join code", async () => {
      const g = await h.call("GET", `/api/groups/${g1}`, E("student1"));
      ok(g, 200);
      assert.equal(g.body.students, undefined);
      assert.equal(g.body.joinCode, undefined);
      assert.ok(g.body.teachers.length >= 1);
      const m = await h.call("GET", `/api/groups/${g1}`, E("teacher1"));
      assert.ok(m.body.joinCode && Array.isArray(m.body.students));
      codeG1 = m.body.joinCode;
    });
  });

  // -------------------------------------------------------------------------
  describe("joining groups and approvals", () => {
    let reqId = 0;

    it("7. a student cannot see or read a group before approval", async () => {
      docTeacher = await h.document(U.teacher1.id, "Cell biology handout", "ribosomes assemble proteins inside the cell");
      ok(await h.call("POST", `/api/groups/${g1}/documents`, E("teacher1"), { documentId: docTeacher }), 201);
      ok(await h.call("GET", `/api/groups/${g1}`, E("student2")), 404);
      ok(await h.call("GET", `/api/groups/${g1}/documents`, E("student2")), 404);
      ok(await h.call("GET", `/api/documents/${docTeacher}`, E("student2")), 404);
      assert.ok(!(await searchIds(E("student2"), "ribosomes")).has(docTeacher));
    });

    it("8. duplicate pending requests are prevented (by API and by the database)", async () => {
      const first = await h.call("POST", `/api/groups/join`, E("student2"), { code: codeG1.toLowerCase(), message: "Please add me" });
      ok(first, 201);
      reqId = first.body.id;
      ok(await h.call("POST", `/api/groups/${g1}/requests`, E("student2"), {}), 409);
      ok(await h.call("POST", `/api/groups/join`, E("student2"), { code: codeG1 }), 409);
      await assert.rejects(h.prisma.groupJoinRequest.create({ data: { groupId: g1, studentId: U.student2.id } }), "partial unique index must reject");
      const pending = await h.call("GET", `/api/groups/requests/mine?organizationId=${orgA}`, E("student2"));
      assert.equal(pending.body.filter((r: any) => r.status === "PENDING").length, 1);
    });

    it("students can cancel their own pending request, and only their own", async () => {
      ok(await h.call("DELETE", `/api/groups/requests/${reqId}`, E("student1")), 404);
      ok(await h.call("DELETE", `/api/groups/requests/${reqId}`, E("student2")), 200);
      const again = await h.call("POST", `/api/groups/${g1}/requests`, E("student2"), { message: "retry" });
      ok(again, 201);
      reqId = again.body.id;
    });

    it("requests are limited to the student's own organization and to students", async () => {
      ok(await h.call("POST", `/api/groups/${g1}/requests`, E("studentB"), {}), 403);
      ok(await h.call("POST", `/api/groups/${g1}/requests`, E("indie"), {}), 403);
      ok(await h.call("POST", `/api/groups/${g1}/requests`, E("teacher2"), {}), 403);
      ok(await h.call("POST", `/api/groups/join`, E("indie"), { code: codeG1 }), 403);
    });

    it("9. teachers approve/reject only requests of groups they are assigned to", async () => {
      // teacher2 is NOT assigned to g3
      const r3 = await h.call("POST", `/api/groups/${g3}/requests`, E("student2"), {});
      ok(r3, 201);
      ok(await h.call("POST", `/api/groups/${g3}/requests/${r3.body.id}/approve`, E("teacher2")), 403);
      ok(await h.call("GET", `/api/groups/${g3}/requests`, E("teacher2")), 403);
      // a request id from another group cannot be reviewed through a group you do manage
      ok(await h.call("POST", `/api/groups/${g1}/requests/${r3.body.id}/approve`, E("teacher1")), 404);
      // teacher2 reviews a request of g1 (assigned) and approval grants real access
      ok(await h.call("POST", `/api/groups/${g1}/requests/${reqId}/approve`, E("teacher2")), 201);
      ok(await h.call("GET", `/api/groups/${g1}`, E("student2")), 200);
      assert.ok((await h.call("GET", `/api/documents/${docTeacher}`, E("student2"))).status === 200, "approved student reads shared document");
      assert.ok((await searchIds(E("student2"), "ribosomes", { "x-workspace": `org:${orgA}` })).has(docTeacher));
      ok(await h.call("POST", `/api/groups/${g1}/requests/${reqId}/approve`, E("teacher1")), 409);
      // rejection path, by the lead teacher
      ok(await h.call("POST", `/api/groups/${g3}/requests/${r3.body.id}/reject`, E("teacher1")), 201);
      assert.equal((await h.prisma.groupJoinRequest.findUnique({ where: { id: r3.body.id } }))?.status, "REJECTED");
      assert.equal((await h.prisma.groupJoinRequest.findUnique({ where: { id: r3.body.id } }))?.reviewedById, U.teacher1.id, "reviewer recorded");
      ok(await h.call("GET", `/api/groups/${g3}`, E("student2")), 404);
    });

    it("10. administrators manage every group of their organization", async () => {
      const all = await h.call("GET", `/api/organizations/${orgA}/groups`, E("adminA"));
      assert.equal(all.body.total, 3);
      ok(await h.call("GET", `/api/groups/${g3}`, E("adminA")), 200);
      const r = await h.call("POST", `/api/groups/${g3}/requests`, E("student2"), {});
      ok(await h.call("POST", `/api/groups/${g3}/requests/${r.body.id}/approve`, E("adminA")), 201);
      ok(await h.call("DELETE", `/api/groups/${g3}/students/${U.student2.id}`, E("adminA")), 200);
    });
  });

  // -------------------------------------------------------------------------
  describe("documents, workspaces and access removal", () => {
    it("personal documents never become visible to an organization", async () => {
      // student1 owns a personal doc, then is a member of A: adminA/teachers still cannot read it.
      const mine = await h.document(U.student1.id, "Student1 private diary", "secret diary entry about quantum tunnelling");
      for (const who of ["adminA", "teacher1", "student2"]) {
        ok(await h.call("GET", `/api/documents/${mine}`, E(who)), 404);
        assert.ok(!(await searchIds(E(who), "quantum tunnelling", { "x-workspace": `org:${orgA}` })).has(mine));
      }
      ok(await h.call("GET", `/api/documents/${mine}`, E("student1")), 200);
    });

    it("workspaces are separated: the organization view lists only shared material, the personal view only personal", async () => {
      const personal = await listIds(E("student1"));
      assert.ok(!personal.has(docAdminOrg), "organization-wide documents are not part of a student's personal library");
      const org = await listIds(E("student1"), { "x-workspace": `org:${orgA}` });
      assert.ok(org.has(docTeacher), "shared document is listed in the organization workspace");
      const teacherPersonal = await listIds(E("teacher1"));
      assert.ok(teacherPersonal.has(docTeacher), "owner still has it in their library");
      const studentOrgOnly = await h.call("GET", "/api/documents", E("student1"), undefined, { "x-workspace": `org:${orgA}` });
      assert.ok(studentOrgOnly.body.every((d: any) => d.name !== "Student1 private diary"), "personal docs excluded from the org workspace");
    });

    it("13. a forged workspace header cannot reach an organization you do not belong to", async () => {
      ok(await h.call("GET", "/api/documents", E("studentB"), undefined, { "x-workspace": `org:${orgA}` }), 403);
      ok(await h.call("GET", "/api/documents", E("indie"), undefined, { "x-workspace": `org:${orgA}` }), 403);
      ok(await h.call("GET", "/api/documents", E("indie"), undefined, { "x-workspace": "org:abc" }), 403);
      ok(await h.call("GET", "/api/documents", E("indie"), undefined, { "x-workspace": `org:${orgB}` }), 403);
    });

    it("only the owner shares a document, and only into their own organization's groups", async () => {
      ok(await h.call("POST", `/api/groups/${g1}/documents`, E("teacher2"), { documentId: docTeacher }), 404); // not theirs
      ok(await h.call("POST", `/api/groups/${g1}/documents`, E("student1"), { documentId: docTeacher }), 403); // students cannot share
      ok(await h.call("POST", `/api/groups/${gB}/documents`, E("teacher1"), { documentId: docTeacher }), 404); // foreign group
      const forged = await h.call("POST", `/api/groups/${g1}/documents`, E("teacher1"), { documentId: 99999999 });
      ok(forged, 404);
    });

    it("organization-wide sharing reaches every active member read-only; non-members and other orgs get nothing", async () => {
      docAdminOrg = await h.document(U.adminA.id, "Campus handbook", "library opening hours handbook zeppelin");
      ok(await h.call("POST", `/api/organizations/${orgA}/documents`, E("adminA"), { documentId: docAdminOrg }), 201);
      ok(await h.call("POST", `/api/organizations/${orgA}/documents`, E("teacher1"), { documentId: docAdminOrg }), 403);
      for (const who of ["student1", "student2", "teacher1", "teacher2"]) {
        ok(await h.call("GET", `/api/documents/${docAdminOrg}`, E(who)), 200);
      }
      for (const who of ["studentB", "adminB", "indie"]) ok(await h.call("GET", `/api/documents/${docAdminOrg}`, E(who)), 404);
      const asStudent = await h.call("GET", `/api/documents/${docAdminOrg}`, E("student1"));
      assert.equal(asStudent.body.accessRole, "VIEWER");
      ok(await h.call("PATCH", `/api/documents/${docAdminOrg}`, E("student1"), { name: "defaced" }), 403, 404);
      assert.ok((await searchIds(E("student1"), "zeppelin", { "x-workspace": `org:${orgA}` })).has(docAdminOrg));
      assert.ok(!(await searchIds(E("studentB"), "zeppelin")).has(docAdminOrg));
    });

    it("11. removed students immediately lose access to group documents (API, search, assistant scope)", async () => {
      assert.ok((await h.call("GET", `/api/documents/${docTeacher}`, E("student1"))).status === 200);
      ok(await h.call("DELETE", `/api/groups/${g1}/students/${U.student1.id}`, E("teacher1")), 200);
      ok(await h.call("GET", `/api/documents/${docTeacher}`, E("student1")), 404);
      ok(await h.call("GET", `/api/groups/${g1}/documents`, E("student1")), 404);
      assert.ok(!(await searchIds(E("student1"), "ribosomes", { "x-workspace": `org:${orgA}` })).has(docTeacher));
      const conv = await h.call("POST", "/api/conversations", E("student1"), { documentId: docTeacher });
      ok(conv, 404);
    });

    it("an archived group is read-only: members keep reading, nothing new can be added", async () => {
      ok(await h.call("POST", `/api/groups/${g1}/students`, E("teacher1"), { studentId: U.student1.id }), 201);
      ok(await h.call("POST", `/api/groups/${g1}/archive`, E("teacher2")), 403); // co-teacher cannot archive
      ok(await h.call("POST", `/api/groups/${g1}/archive`, E("teacher1")), 201);
      ok(await h.call("GET", `/api/documents/${docTeacher}`, E("student1")), 200);
      ok(await h.call("POST", `/api/groups/${g1}/students`, E("teacher1"), { studentId: U.student2.id }), 403);
      ok(await h.call("POST", `/api/groups/${g1}/requests`, E("student3"), {}), 403, 404);
      const d2 = await h.document(U.teacher1.id, "Late handout", "late handout content");
      ok(await h.call("POST", `/api/groups/${g1}/documents`, E("teacher1"), { documentId: d2 }), 403);
      ok(await h.call("POST", `/api/groups/${g1}/unarchive`, E("adminA")), 201);
    });

    it("unsharing the last group revokes access and returns the document to PERSONAL", async () => {
      ok(await h.call("DELETE", `/api/groups/${g1}/documents/${docTeacher}`, E("teacher1")), 200);
      ok(await h.call("GET", `/api/documents/${docTeacher}`, E("student1")), 404);
      const row = await h.prisma.document.findUniqueOrThrow({ where: { id: docTeacher } });
      assert.equal(row.scope, "PERSONAL");
      assert.equal(row.organizationId, null);
      assert.equal(row.userId, U.teacher1.id, "ownership never changes");
      ok(await h.call("POST", `/api/groups/${g1}/documents`, E("teacher1"), { documentId: docTeacher }), 201); // re-share for later checks
    });

    it("suspending a member or the whole organization cuts access without deleting anything", async () => {
      const members = await h.call("GET", `/api/organizations/${orgA}/members?role=STUDENT`, E("adminA"));
      const s1 = members.body.items.find((m: any) => m.userId === U.student1.id);
      ok(await h.call("PATCH", `/api/organizations/${orgA}/members/${s1.membershipId}`, E("adminA"), { status: "SUSPENDED" }), 200);
      ok(await h.call("GET", `/api/documents/${docTeacher}`, E("student1")), 404);
      ok(await h.call("GET", `/api/documents/${docAdminOrg}`, E("student1")), 404);
      ok(await h.call("GET", `/api/organizations/${orgA}`, E("student1")), 404);
      ok(await h.call("GET", "/api/documents", E("student1"), undefined, { "x-workspace": `org:${orgA}` }), 403);
      assert.equal((await h.call("GET", "/api/auth/me", E("student1"))).status, 200, "account itself is unaffected");
      ok(await h.call("PATCH", `/api/organizations/${orgA}/members/${s1.membershipId}`, E("adminA"), { status: "ACTIVE" }), 200);
      ok(await h.call("GET", `/api/documents/${docTeacher}`, E("student1")), 200);

      ok(await h.call("PATCH", `/api/admin/organizations/${orgA}/status`, E("platform"), { status: "SUSPENDED" }), 200);
      ok(await h.call("GET", `/api/documents/${docAdminOrg}`, E("student1")), 404);
      ok(await h.call("GET", `/api/organizations/${orgA}/stats`, E("adminA")), 404);
      ok(await h.call("PATCH", `/api/admin/organizations/${orgA}/status`, E("platform"), { status: "ACTIVE" }), 200);
      ok(await h.call("GET", `/api/documents/${docAdminOrg}`, E("student1")), 200);
    });
  });

  // -------------------------------------------------------------------------
  describe("privilege escalation and forged identifiers", () => {
    it("12. students cannot elevate themselves or manage anyone", async () => {
      const members = await h.call("GET", `/api/organizations/${orgA}/members?role=STUDENT`, E("adminA"));
      const s1 = members.body.items.find((m: any) => m.userId === U.student1.id);
      ok(await h.call("PATCH", `/api/organizations/${orgA}/members/${s1.membershipId}`, E("student1"), { role: "ADMIN" }), 403);
      ok(await h.call("POST", `/api/organizations/${orgA}/members`, E("student1"), { email: E("student1"), role: "ADMIN" }), 403);
      ok(await h.call("GET", `/api/organizations/${orgA}/members`, E("student1")), 403);
      ok(await h.call("POST", `/api/organizations/${orgA}/invitations`, E("student1"), { email: E("x1"), role: "TEACHER" }), 403);
      ok(await h.call("POST", `/api/organizations/${orgA}/groups`, E("student1"), { name: "My own group" }), 403);
      ok(await h.call("POST", `/api/groups/${g2}/teachers`, E("student1"), { teacherId: U.student1.id, role: "LEAD_TEACHER" }), 403);
      ok(await h.call("PATCH", `/api/organizations/${orgA}`, E("student1"), { name: "mine now" }), 403);
      ok(await h.call("POST", `/api/admin/organizations`, E("student1"), { name: "Mine" }), 403);
      assert.equal((await h.prisma.organizationMembership.findUniqueOrThrow({ where: { id: s1.membershipId } })).role, "STUDENT");
    });

    it("an administrator cannot demote/suspend themselves or remove the last administrator", async () => {
      const me = (await h.call("GET", `/api/organizations/${orgA}/members?role=ADMIN`, E("adminA"))).body.items[0];
      ok(await h.call("PATCH", `/api/organizations/${orgA}/members/${me.membershipId}`, E("adminA"), { role: "TEACHER" }), 403);
      ok(await h.call("POST", `/api/organizations/${orgA}/leave`, E("adminA")), 400);
    });

    it("13. forged organization / group / membership / request ids cannot cross tenants", async () => {
      const bMembership = await h.prisma.organizationMembership.findFirstOrThrow({ where: { organizationId: orgB, role: "TEACHER" } });
      // a membership id from B used under A's path is simply not found
      ok(await h.call("PATCH", `/api/organizations/${orgA}/members/${bMembership.id}`, E("adminA"), { status: "REMOVED" }), 404);
      assert.equal((await h.prisma.organizationMembership.findUniqueOrThrow({ where: { id: bMembership.id } })).status, "ACTIVE");
      // B's teacher cannot touch A's groups
      for (const call of [
        () => h.call("GET", `/api/groups/${g1}`, E("teacherB")),
        () => h.call("POST", `/api/groups/${g1}/students`, E("teacherB"), { studentId: U.studentB.id }),
        () => h.call("POST", `/api/groups/${g1}/documents`, E("teacherB"), { documentId: 1 }),
        () => h.call("GET", `/api/groups/${g1}/requests`, E("teacherB")),
      ]) ok(await call(), 404);
      // creating a group "in" an organization you do not belong to
      ok(await h.call("POST", `/api/organizations/${orgA}/groups`, E("teacherB"), { name: "Injected" }), 404);
      // nonsense ids
      ok(await h.call("GET", `/api/organizations/0`, E("adminA")), 404);
      ok(await h.call("GET", `/api/groups/99999999`, E("adminA")), 404);
      ok(await h.call("GET", `/api/organizations/abc`, E("adminA")), 400);
      // body-supplied ids/roles that DTOs do not allow are rejected outright
      ok(await h.call("POST", `/api/organizations/${orgA}/groups`, E("teacher1"), { name: "x1", organizationId: orgB }), 400);
      ok(await h.call("POST", `/api/groups/join`, E("student2"), { code: codeG1, groupId: g3, role: "TEACHER" }), 400);
      // unauthenticated
      ok(await h.call("GET", `/api/organizations/${orgA}`), 401);
      ok(await h.call("GET", `/api/groups/${g1}`), 401);
    });
  });

  // -------------------------------------------------------------------------
  describe("invitations", () => {
    let token = "", invitationId = 0;

    it("creates a link, stores only a hash, forbids duplicates and role abuse", async () => {
      const inv = await h.call("POST", `/api/organizations/${orgA}/invitations`, E("adminA"), { email: "Newcomer@Test.Local", role: "STUDENT", groupId: g2 });
      ok(inv, 201);
      token = inv.body.token;
      invitationId = inv.body.id;
      assert.equal(inv.body.emailSent, false, "no email service is configured; the link must be shared manually");
      assert.match(inv.body.url, /\/invite\/.+/);
      const row = await h.prisma.organizationInvitation.findUniqueOrThrow({ where: { id: invitationId } });
      assert.notEqual(row.tokenHash, token);
      assert.equal(row.tokenHash.length, 64);
      assert.equal(JSON.stringify(row).includes(token), false, "raw token must not be persisted");
      assert.ok(row.expiresAt.getTime() > Date.now());
      ok(await h.call("POST", `/api/organizations/${orgA}/invitations`, E("adminA"), { email: E("newcomer"), role: "STUDENT", groupId: g2 }), 409);
      // a teacher can only invite students, into a group they manage
      ok(await h.call("POST", `/api/organizations/${orgA}/invitations`, E("teacher1"), { email: E("t-new"), role: "TEACHER" }), 403);
      ok(await h.call("POST", `/api/organizations/${orgA}/invitations`, E("teacher1"), { email: E("s-new"), role: "STUDENT" }), 400);
      ok(await h.call("POST", `/api/organizations/${orgA}/invitations`, E("teacher1"), { email: E("s-new"), role: "STUDENT", groupId: gB }), 404);
      ok(await h.call("POST", `/api/organizations/${orgA}/invitations`, E("teacher1"), { email: E("s-new"), role: "STUDENT", groupId: g2 }), 201);
      // teacher2 is co-teacher of g2 but did not send teacher1's invitation: lists only their own
      const list = await h.call("GET", `/api/organizations/${orgA}/invitations`, E("teacher2"));
      assert.equal(list.body.length, 0);
      assert.equal((await h.call("GET", `/api/organizations/${orgA}/invitations`, E("adminA"))).body.length, 2);
      assert.equal(JSON.stringify((await h.call("GET", `/api/organizations/${orgA}/invitations`, E("adminA"))).body).includes(token), false);
    });

    it("public preview reveals the organization and role but only a masked email", async () => {
      const p = await h.call("GET", `/api/invitations/${token}`);
      ok(p, 200);
      assert.equal(p.body.organizationName, "Alpha University");
      assert.equal(p.body.role, "STUDENT");
      assert.equal(p.body.groupName, "Chemistry 101");
      assert.ok(!JSON.stringify(p.body).includes("newcomer@test.local"));
      ok(await h.call("GET", `/api/invitations/not-a-real-token`), 404);
    });

    it("12. only the invited account can accept, and the role comes from the invitation alone", async () => {
      ok(await h.call("POST", `/api/invitations/${token}/accept`, E("student3"), { role: "ADMIN" }), 403); // different email, whatever the body says
      ok(await h.call("POST", `/api/invitations/${token}/accept`), 401);
      ok(await h.call("POST", `/api/invitations/${token}/accept`, E("newcomer"), { role: "ADMIN" }), 201); // a role in the body is ignored
      const m = await h.prisma.organizationMembership.findFirstOrThrow({ where: { organizationId: orgA, userId: U.newcomer.id } });
      assert.equal(m.role, "STUDENT");
      assert.equal(m.status, "ACTIVE");
      assert.equal((await h.prisma.groupStudent.findUniqueOrThrow({ where: { groupId_studentId: { groupId: g2, studentId: U.newcomer.id } } })).status, "ACTIVE");
      ok(await h.call("POST", `/api/invitations/${token}/accept`, E("newcomer")), 404); // single use
      ok(await h.call("GET", `/api/invitations/${token}`), 404);
    });

    it("revoked and expired invitations stop working", async () => {
      const inv = await h.call("POST", `/api/organizations/${orgA}/invitations`, E("adminA"), { email: E("student3"), role: "STUDENT" });
      ok(inv, 201);
      ok(await h.call("DELETE", `/api/organizations/${orgA}/invitations/${inv.body.id}`, E("adminA")), 200);
      ok(await h.call("POST", `/api/invitations/${inv.body.token}/accept`, E("student3")), 404);
      const again = await h.call("POST", `/api/organizations/${orgA}/invitations`, E("adminA"), { email: E("student3"), role: "STUDENT" });
      ok(again, 201);
      await h.prisma.organizationInvitation.update({ where: { id: again.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      ok(await h.call("POST", `/api/invitations/${again.body.token}/accept`, E("student3")), 404);
      const resent = await h.call("POST", `/api/organizations/${orgA}/invitations`, E("adminA"), { email: E("student3"), role: "STUDENT" });
      ok(resent, 201, 409);
    });

    it("an invited platform-less admin: unknown admin email creates an admin invitation link", async () => {
      const res = await h.call("POST", "/api/admin/organizations", E("platform"), { name: "Gamma Institute", adminEmail: E("future-admin") });
      ok(res, 201);
      assert.equal(res.body.adminAdded, false);
      assert.ok(res.body.invitation.token);
      assert.equal((await h.prisma.organizationInvitation.findUniqueOrThrow({ where: { id: res.body.invitation.id } })).intendedRole, "ADMIN");
    });
  });

  // -------------------------------------------------------------------------
  describe("lifecycle: join later, leave, personal data survives", () => {
    it("an independent user joins an organization later via its code, with approval", async () => {
      const info = await h.call("GET", `/api/organizations/${orgA}`, E("adminA"));
      const code = info.body.joinCode;
      assert.ok(code);
      assert.equal((await h.call("GET", `/api/organizations/${orgA}`, E("teacher1"))).body.joinCode, undefined, "code is admin-only");
      ok(await h.call("POST", "/api/organizations/lookup", E("indie"), { code: "ZZZZZZZZ" }), 404);
      ok(await h.call("POST", "/api/organizations/lookup", E("indie"), { code }), 201, 200);
      const req = await h.call("POST", "/api/organizations/join-requests", E("indie"), { code, message: "I am a new student", role: "ADMIN" });
      ok(req, 400); // role is not an accepted field
      const real = await h.call("POST", "/api/organizations/join-requests", E("indie"), { code, message: "I am a new student" });
      ok(real, 201);
      ok(await h.call("POST", "/api/organizations/join-requests", E("indie"), { code }), 409);
      // no access yet
      ok(await h.call("GET", `/api/organizations/${orgA}`, E("indie")), 404);
      ok(await h.call("GET", "/api/documents", E("indie"), undefined, { "x-workspace": `org:${orgA}` }), 403);
      // only org admins review
      ok(await h.call("POST", `/api/organizations/${orgA}/join-requests/${real.body.id}/approve`, E("teacher1")), 403);
      ok(await h.call("POST", `/api/organizations/${orgB}/join-requests/${real.body.id}/approve`, E("adminB")), 404);
      ok(await h.call("POST", `/api/organizations/${orgA}/join-requests/${real.body.id}/approve`, E("adminA")), 201);
      const mine = await h.call("GET", "/api/organizations/mine", E("indie"));
      assert.equal(mine.body.length, 1);
      assert.equal(mine.body[0].role, "STUDENT", "joiners are always students");
    });

    it("4. personal documents stay private after joining, and org members see none of them", async () => {
      ok(await h.call("GET", `/api/documents/${docIndie}`, E("adminA")), 404);
      ok(await h.call("GET", `/api/documents/${docIndie}`, E("teacher1")), 404);
      const orgView = await listIds(E("indie"), { "x-workspace": `org:${orgA}` });
      assert.ok(!orgView.has(docIndie), "personal doc is not part of the organization workspace");
      assert.ok((await listIds(E("indie"))).has(docIndie), "personal workspace unchanged");
      assert.ok((await searchIds(E("indie"), "photosynthesis")).has(docIndie));
      assert.ok(!(await searchIds(E("adminA"), "photosynthesis", { "x-workspace": `org:${orgA}` })).has(docIndie));
    });

    it("5. leaving keeps personal documents, conversations and chunks; organization access ends", async () => {
      const conv = await h.call("POST", "/api/conversations", E("indie"), {});
      ok(conv, 201);
      // put the student in a group and share one of their own docs through a (teacher) role-less path: not possible for students
      ok(await h.call("POST", `/api/groups/${g1}/students`, E("teacher1"), { studentId: U.indie.id }), 201);
      assert.equal((await h.call("GET", `/api/documents/${docTeacher}`, E("indie"))).status, 200);
      ok(await h.call("POST", `/api/organizations/${orgA}/leave`, E("indie")), 201);
      assert.equal((await h.prisma.organizationMembership.findFirstOrThrow({ where: { userId: U.indie.id } })).status, "REMOVED");
      ok(await h.call("GET", `/api/documents/${docTeacher}`, E("indie")), 404);
      ok(await h.call("GET", `/api/documents/${docAdminOrg}`, E("indie")), 404);
      ok(await h.call("GET", "/api/documents", E("indie"), undefined, { "x-workspace": `org:${orgA}` }), 403);
      assert.ok((await listIds(E("indie"))).has(docIndie));
      assert.equal(await h.prisma.documentChunk.count({ where: { documentId: docIndie } }), 1);
      ok(await h.call("GET", `/api/conversations/${conv.body.id}`, E("indie")), 200);
      assert.equal((await h.prisma.groupStudent.findUniqueOrThrow({ where: { groupId_studentId: { groupId: g1, studentId: U.indie.id } } })).status, "LEFT");
      // can rejoin later
      const info = await h.call("GET", `/api/organizations/${orgA}`, E("adminA"));
      ok(await h.call("POST", "/api/organizations/join-requests", E("indie"), { code: info.body.joinCode }), 201);
    });

    it("a teacher or student can belong to several organizations with independent roles", async () => {
      ok(await h.call("POST", `/api/organizations/${orgB}/members`, E("adminB"), { email: E("teacher1"), role: "STUDENT" }), 201);
      const mine = (await h.call("GET", "/api/organizations/mine", E("teacher1"))).body;
      assert.equal(mine.length, 2);
      const roles = Object.fromEntries(mine.map((m: any) => [m.organization.id, m.role]));
      assert.equal(roles[orgA], "TEACHER");
      assert.equal(roles[orgB], "STUDENT", "role is per organization");
      ok(await h.call("POST", `/api/organizations/${orgB}/groups`, E("teacher1"), { name: "no" }), 403);
      ok(await h.call("POST", `/api/organizations/${orgA}/groups`, E("teacher1"), { name: "Still a teacher in A" }), 201);
    });

    it("a removed teacher loses group management and their shared documents stop being shared", async () => {
      const row = await h.prisma.organizationMembership.findFirstOrThrow({ where: { organizationId: orgA, userId: U.teacher2.id } });
      const shared = await h.document(U.teacher2.id, "T2 handout", "teacher two handout kumquat");
      ok(await h.call("POST", `/api/groups/${g2}/documents`, E("teacher2"), { documentId: shared }), 201);
      ok(await h.call("GET", `/api/documents/${shared}`, E("student1")), 200);
      ok(await h.call("DELETE", `/api/organizations/${orgA}/members/${row.id}`, E("adminA")), 200);
      ok(await h.call("GET", `/api/groups/${g2}`, E("teacher2")), 404);
      ok(await h.call("GET", `/api/documents/${shared}`, E("student1")), 404);
      const doc = await h.prisma.document.findUniqueOrThrow({ where: { id: shared } });
      assert.equal(doc.userId, U.teacher2.id);
      assert.equal(doc.scope, "PERSONAL");
      ok(await h.call("GET", `/api/documents/${shared}`, E("teacher2")), 200);
    });
  });

  // -------------------------------------------------------------------------
  describe("statistics, audit trail and notifications", () => {
    it("organization statistics are real and tenant-scoped", async () => {
      const a = await h.call("GET", `/api/organizations/${orgA}/stats`, E("adminA"));
      ok(a, 200);
      assert.ok(a.body.teachers >= 1 && a.body.students >= 2);
      assert.ok(a.body.groups.total >= 3);
      assert.ok(a.body.documents.organizationShared >= 1);
      const b = await h.call("GET", `/api/organizations/${orgB}/stats`, E("adminB"));
      assert.equal(b.body.groups.total, 1);
      assert.ok(b.body.students <= 2);
      ok(await h.call("GET", `/api/organizations/${orgA}/stats`, E("teacher1")), 403);
    });

    it("audit entries carry actor, action, target and organization; admins only read their own", async () => {
      const logs = await h.call("GET", `/api/organizations/${orgA}/audit-logs?pageSize=100`, E("adminA"));
      ok(logs, 200);
      const actions = new Set(logs.body.items.map((l: any) => l.action));
      for (const a of ["GROUP_CREATE", "GROUP_STUDENT_ADD", "GROUP_JOIN_REVIEW", "ORG_INVITE_CREATE", "ORG_INVITE_ACCEPT", "DOCUMENT_SHARE_GROUP", "GROUP_TEACHER_ASSIGN"]) {
        assert.ok(actions.has(a), `missing audit action ${a}`);
      }
      assert.ok(logs.body.items.every((l: any) => l.actorEmail && l.createdAt));
      const rows = await h.prisma.auditLog.findMany({ where: { organizationId: orgB } });
      assert.ok(rows.every((r) => !JSON.stringify(logs.body).includes(`"id":${r.id},`)));
      assert.ok(rows.length > 0 && rows.every((r) => r.organizationId === orgB));
    });

    it("notifications are created for requests, reviews and membership changes without duplicates", async () => {
      const t = await h.call("GET", "/api/notifications", E("student2"));
      const types = t.body.items.map((n: any) => n.type);
      assert.ok(types.includes("GROUP_REQUEST_REVIEWED"));
      const teacher = await h.call("GET", "/api/notifications", E("teacher1"));
      assert.ok(teacher.body.items.some((n: any) => n.type === "GROUP_JOIN_REQUEST"));
      const keys = t.body.items.filter((n: any) => !n.readAt).map((n: any) => `${n.type}|${n.title}|${n.message}`);
      assert.equal(new Set(keys).size, keys.length, "identical unread notifications are not repeated");
    });
  });

  // -------------------------------------------------------------------------
  describe("existing platform behaviour is intact", () => {
    it("14. owner-only and direct DocumentPermission sharing behave exactly as before", async () => {
      const doc = await h.document(U.student3.id, "Direct share", "direct permission pomegranate");
      ok(await h.call("GET", `/api/documents/${doc}`, E("student2")), 404);
      await h.prisma.documentPermission.create({ data: { documentId: doc, userId: U.student2.id, role: "VIEWER" } });
      const res = await h.call("GET", `/api/documents/${doc}`, E("student2"));
      ok(res, 200);
      assert.equal(res.body.accessRole, "VIEWER");
      assert.ok((await searchIds(E("student2"), "pomegranate")).has(doc), "direct share is searchable in the personal workspace");
      ok(await h.call("PATCH", `/api/documents/${doc}`, E("student2"), { name: "nope" }), 403);
      assert.ok((await h.call("GET", "/api/documents/shared", E("student2"))).body.some((d: any) => d.id === doc));
    });

    it("platform admin endpoints and global role checks are unchanged", async () => {
      ok(await h.call("GET", "/api/admin/stats", E("platform")), 200);
      ok(await h.call("GET", "/api/admin/stats", E("adminA")), 403, 404);
      ok(await h.call("GET", "/api/admin/organizations", E("platform")), 200);
      ok(await h.call("GET", "/api/admin/organizations", E("adminA")), 403);
      const list = await h.call("GET", "/api/admin/organizations", E("platform"));
      assert.ok(list.body.items.length >= 2);
    });
  });
});
