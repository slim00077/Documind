import { API_URL } from "../config/api";
import i18n from "../i18n";

export class OrgApiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "OrgApiError";
    this.statusCode = statusCode;
  }
}

export type OrgRole = "ADMIN" | "TEACHER" | "STUDENT";
export type MembershipStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REMOVED";
export type OrganizationType = "SCHOOL" | "UNIVERSITY" | "TRAINING_CENTER" | "COMPANY" | "OTHER";
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number };

export type OrgSummary = { id: number; name: string; slug: string; description: string | null; organizationType: OrganizationType };
export type MyMembership = { membershipId: number; role: OrgRole; joinedAt: string | null; organization: OrgSummary & { hasLogo: boolean } };
export type OrgDetail = OrgSummary & { status: string; hasLogo: boolean; createdAt: string; myRole: OrgRole; joinCode?: string | null; isDiscoverable?: boolean };

export type OrgStats = {
  teachers: number; students: number; admins: number; activeMemberships: number; suspendedMemberships: number;
  groups: { active: number; archived: number; total: number };
  pendingInvitations: number; pendingGroupRequests: number; pendingOrgRequests: number;
  documents: { organizationShared: number; groupShared: number; sharedToGroupsLast7Days: number };
};

export type Member = { membershipId: number; userId: number; name: string; email: string; role: OrgRole; status: MembershipStatus; joinedAt: string | null; groupCount: number };
export type TeacherBrief = { id: number; name: string; role?: "LEAD_TEACHER" | "CO_TEACHER"; email?: string };
export type GroupSummary = { id: number; organizationId: number; name: string; description: string | null; subject: string | null; academicYear: string | null; status: "ACTIVE" | "ARCHIVED"; createdAt: string };
export type GroupRow = GroupSummary & { teachers: TeacherBrief[]; studentCount: number; pendingRequests?: number; documentCount?: number };
export type GroupDetail = GroupSummary & {
  myAccess: { canManage: boolean; canAdminister: boolean; teacherRole: string | null; isStudent: boolean };
  teachers: TeacherBrief[];
  joinCode?: string; pendingRequests?: number;
  students?: { id: number; name: string; email: string; joinedAt: string }[];
};
export type Brief = { id: number; name: string; email: string };
export type GroupRequest = { id: number; status: RequestStatus; message: string | null; createdAt: string; reviewedAt: string | null; student: Brief };
export type InboxRequest = { id: number; message: string | null; createdAt: string; group: { id: number; name: string }; student: Brief };
export type MyGroupRequest = { id: number; status: RequestStatus; message: string | null; createdAt: string; group: { id: number; name: string; organizationId: number } };
export type OrgJoinRequest = { id: number; status: RequestStatus; message: string | null; createdAt: string; user: Brief };
export type MyOrgRequest = { id: number; status: RequestStatus; message: string | null; createdAt: string; organization: { id: number; name: string } };
export type DiscoverGroup = { id: number; name: string; description: string | null; subject: string | null; academicYear: string | null; studentCount: number; teachers: { id: number; name: string }[]; joined: boolean; pendingRequestId: number | null };
export type Invitation = { id: number; email: string; role: OrgRole; groupId: number | null; groupName: string | null; status: string; expiresAt: string; createdAt: string; acceptedAt: string | null };
export type IssuedInvitation = { id: number; email: string; role: OrgRole; groupId: number | null; expiresAt: string; token: string; url: string; emailSent: boolean };
export type InvitationPreview = { organizationName: string; role: OrgRole; groupName: string | null; emailHint: string; expiresAt: string };
export type SharedDoc = { id: number; name: string; mimeType: string | null; size?: number | null; status: string; owner?: { id: number; name: string }; sharedAt?: string; updatedAt?: string; user?: { id: number; name: string } };
export type StudentRow = { userId: number; name: string; email: string; status: MembershipStatus; joinedAt: string | null; groups: { id: number; name: string; joinedAt: string }[] };
export type TeacherOverview = {
  totals: { groups: number; activeGroups: number; students: number; pendingRequests: number };
  groups: { id: number; name: string; status: string; studentCount: number }[];
  recentDocuments: { id: number; name: string; mimeType: string | null; group: { id: number; name: string }; sharedAt: string }[];
  recentActivity: { id: number; action: string; actorName: string | null; createdAt: string }[];
};
export type StudentOverview = {
  organization: { id: number; name: string; organizationType: OrganizationType; description: string | null };
  groups: GroupRow[]; teachers: { id: number; name: string }[];
  pendingRequests: { id: number; createdAt: string; group: { id: number; name: string } }[];
  recentDocuments: { id: number; name: string; mimeType: string | null; group: { id: number; name: string }; sharedAt: string }[];
};
export type OrgAuditEntry = { id: number; action: string; actorName: string | null; actorEmail: string | null; targetType: string | null; targetId: number | null; metadata: Record<string, unknown> | null; createdAt: string };
export type PlatformOrg = { id: number; name: string; slug: string; organizationType: OrganizationType; status: string; createdAt: string; groups: number; admins: number; teachers: number; students: number };

const extractError = (data: { message?: string | string[] }) => (Array.isArray(data.message) ? data.message.join(" ") : data.message ?? i18n.t("Request failed"));

async function api<T>(token: string | null, method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string | string[] } & T;
  if (!response.ok) throw new OrgApiError(extractError(data), response.status);
  return data as T;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
};

type Q = { page?: number; pageSize?: number; search?: string };
const o = (id: number) => `/organizations/${id}`;

export const orgApi = {
  // own context
  mine: (t: string) => api<MyMembership[]>(t, "GET", "/organizations/mine"),
  discover: (t: string, search?: string) => api<OrgSummary[]>(t, "GET", `/organizations/discover${qs({ search })}`),
  lookup: (t: string, code: string) => api<OrgSummary>(t, "POST", "/organizations/lookup", { code }),
  requestJoin: (t: string, body: { organizationId?: number; code?: string; message?: string }) => api<{ id: number }>(t, "POST", "/organizations/join-requests", body),
  myOrgRequests: (t: string) => api<MyOrgRequest[]>(t, "GET", "/organizations/join-requests/mine"),
  cancelOrgRequest: (t: string, id: number) => api<unknown>(t, "DELETE", `/organizations/join-requests/${id}`),
  leave: (t: string, id: number) => api<unknown>(t, "POST", `${o(id)}/leave`),
  // profile
  get: (t: string, id: number) => api<OrgDetail>(t, "GET", o(id)),
  update: (t: string, id: number, body: Partial<{ name: string; description: string; organizationType: OrganizationType; isDiscoverable: boolean }>) => api<OrgDetail>(t, "PATCH", o(id), body),
  rotateCode: (t: string, id: number) => api<{ joinCode: string }>(t, "POST", `${o(id)}/join-code`),
  uploadLogo: (t: string, id: number, file: File) => { const form = new FormData(); form.append("logo", file); return api<unknown>(t, "POST", `${o(id)}/logo`, undefined, form); },
  stats: (t: string, id: number) => api<OrgStats>(t, "GET", `${o(id)}/stats`),
  auditLogs: (t: string, id: number, q: Q) => api<Paged<OrgAuditEntry>>(t, "GET", `${o(id)}/audit-logs${qs(q)}`),
  // members
  members: (t: string, id: number, q: Q & { role?: OrgRole; status?: MembershipStatus }) => api<Paged<Member>>(t, "GET", `${o(id)}/members${qs(q)}`),
  addMember: (t: string, id: number, body: { email: string; role: OrgRole }) => api<unknown>(t, "POST", `${o(id)}/members`, body),
  updateMember: (t: string, id: number, membershipId: number, body: { role?: OrgRole; status?: MembershipStatus }) => api<unknown>(t, "PATCH", `${o(id)}/members/${membershipId}`, body),
  removeMember: (t: string, id: number, membershipId: number) => api<unknown>(t, "DELETE", `${o(id)}/members/${membershipId}`),
  joinRequests: (t: string, id: number) => api<OrgJoinRequest[]>(t, "GET", `${o(id)}/join-requests`),
  reviewJoinRequest: (t: string, id: number, requestId: number, approve: boolean) => api<unknown>(t, "POST", `${o(id)}/join-requests/${requestId}/${approve ? "approve" : "reject"}`),
  // invitations
  invitations: (t: string, id: number, status?: string) => api<Invitation[]>(t, "GET", `${o(id)}/invitations${qs({ status })}`),
  invite: (t: string, id: number, body: { email: string; role: OrgRole; groupId?: number }) => api<IssuedInvitation>(t, "POST", `${o(id)}/invitations`, body),
  resend: (t: string, id: number, invitationId: number) => api<IssuedInvitation>(t, "POST", `${o(id)}/invitations/${invitationId}/resend`),
  revoke: (t: string, id: number, invitationId: number) => api<unknown>(t, "DELETE", `${o(id)}/invitations/${invitationId}`),
  previewInvitation: (token: string) => api<InvitationPreview>(null, "GET", `/invitations/${encodeURIComponent(token)}`),
  acceptInvitation: (t: string, token: string) => api<{ organizationId: number; role: OrgRole; groupId: number | null }>(t, "POST", `/invitations/${encodeURIComponent(token)}/accept`),
  // groups
  groups: (t: string, id: number, q: Q & { status?: string }) => api<Paged<GroupRow>>(t, "GET", `${o(id)}/groups${qs(q)}`),
  createGroup: (t: string, id: number, body: { name: string; description?: string; subject?: string; academicYear?: string; leadTeacherId?: number }) => api<GroupSummary>(t, "POST", `${o(id)}/groups`, body),
  myGroups: (t: string, id: number) => api<GroupRow[]>(t, "GET", `${o(id)}/my-groups`),
  discoverGroups: (t: string, id: number, search?: string) => api<DiscoverGroup[]>(t, "GET", `${o(id)}/groups-discover${qs({ search })}`),
  students: (t: string, id: number, q: Q & { groupId?: number }) => api<Paged<StudentRow>>(t, "GET", `${o(id)}/students${qs(q)}`),
  inbox: (t: string, id: number) => api<InboxRequest[]>(t, "GET", `${o(id)}/requests`),
  teacherOverview: (t: string, id: number) => api<TeacherOverview>(t, "GET", `${o(id)}/overview/teacher`),
  studentOverview: (t: string, id: number) => api<StudentOverview>(t, "GET", `${o(id)}/overview/student`),
  orgDocuments: (t: string, id: number) => api<SharedDoc[]>(t, "GET", `${o(id)}/documents`),
  shareWithOrg: (t: string, id: number, documentId: number) => api<unknown>(t, "POST", `${o(id)}/documents`, { documentId }),
  unshareFromOrg: (t: string, id: number, documentId: number) => api<unknown>(t, "DELETE", `${o(id)}/documents/${documentId}`),
  // group detail
  group: (t: string, gid: number) => api<GroupDetail>(t, "GET", `/groups/${gid}`),
  updateGroup: (t: string, gid: number, body: Partial<{ name: string; description: string; subject: string; academicYear: string }>) => api<GroupSummary>(t, "PATCH", `/groups/${gid}`, body),
  archiveGroup: (t: string, gid: number, archived: boolean) => api<GroupSummary>(t, "POST", `/groups/${gid}/${archived ? "archive" : "unarchive"}`),
  rotateGroupCode: (t: string, gid: number) => api<{ joinCode: string }>(t, "POST", `/groups/${gid}/join-code`),
  assignTeacher: (t: string, gid: number, teacherId: number, role?: "LEAD_TEACHER" | "CO_TEACHER") => api<unknown>(t, "POST", `/groups/${gid}/teachers`, { teacherId, role }),
  unassignTeacher: (t: string, gid: number, teacherId: number) => api<unknown>(t, "DELETE", `/groups/${gid}/teachers/${teacherId}`),
  addStudent: (t: string, gid: number, studentId: number) => api<unknown>(t, "POST", `/groups/${gid}/students`, { studentId }),
  removeStudent: (t: string, gid: number, studentId: number) => api<unknown>(t, "DELETE", `/groups/${gid}/students/${studentId}`),
  leaveGroup: (t: string, gid: number) => api<unknown>(t, "POST", `/groups/${gid}/leave`),
  groupRequests: (t: string, gid: number) => api<GroupRequest[]>(t, "GET", `/groups/${gid}/requests`),
  reviewGroupRequest: (t: string, gid: number, requestId: number, approve: boolean) => api<unknown>(t, "POST", `/groups/${gid}/requests/${requestId}/${approve ? "approve" : "reject"}`),
  requestGroup: (t: string, gid: number, message?: string) => api<{ id: number }>(t, "POST", `/groups/${gid}/requests`, { message }),
  joinGroupByCode: (t: string, code: string, message?: string) => api<{ id: number; groupId: number }>(t, "POST", "/groups/join", { code, message }),
  myGroupRequests: (t: string, organizationId?: number) => api<MyGroupRequest[]>(t, "GET", `/groups/requests/mine${qs({ organizationId })}`),
  cancelGroupRequest: (t: string, requestId: number) => api<unknown>(t, "DELETE", `/groups/requests/${requestId}`),
  groupDocuments: (t: string, gid: number) => api<SharedDoc[]>(t, "GET", `/groups/${gid}/documents`),
  shareWithGroup: (t: string, gid: number, documentId: number) => api<unknown>(t, "POST", `/groups/${gid}/documents`, { documentId }),
  unshareFromGroup: (t: string, gid: number, documentId: number) => api<unknown>(t, "DELETE", `/groups/${gid}/documents/${documentId}`),
  // platform administration
  platformOrgs: (t: string, q: Q) => api<Paged<PlatformOrg>>(t, "GET", `/admin/organizations${qs(q)}`),
  platformCreate: (t: string, body: { name: string; organizationType?: OrganizationType; description?: string; isDiscoverable?: boolean; adminEmail?: string }) =>
    api<{ id: number; joinCode: string | null; adminAdded: boolean; invitation: IssuedInvitation | null }>(t, "POST", "/admin/organizations", body),
  platformSetStatus: (t: string, id: number, status: "ACTIVE" | "SUSPENDED" | "ARCHIVED") => api<unknown>(t, "PATCH", `/admin/organizations/${id}/status`, { status }),
  platformAddAdmin: (t: string, id: number, email: string) => api<{ adminAdded: boolean; invitation: IssuedInvitation | null }>(t, "POST", `/admin/organizations/${id}/admins`, { email }),
};

/** Logo is behind authentication, so it is fetched with the token and shown through an object URL. */
export async function fetchLogoUrl(token: string, organizationId: number): Promise<string | null> {
  const response = await fetch(`${API_URL}/api/organizations/${organizationId}/logo`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  return URL.createObjectURL(await response.blob());
}
