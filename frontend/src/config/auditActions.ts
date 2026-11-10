import type { TFunction } from "i18next";
import type { TranslationKey } from "../i18n";

/** Every audit action the API records, as short names (filters, chips) and activity-feed sentences. */
export const AUDIT_ACTIONS: { action: string; name: TranslationKey; sentence: TranslationKey }[] = [
  { action: "LOGIN", name: "Login", sentence: "Logged in" },
  { action: "REGISTER", name: "Registration", sentence: "Registered" },
  { action: "DOCUMENT_UPLOAD", name: "Document upload", sentence: "Uploaded a document" },
  { action: "DOCUMENT_UPDATE", name: "Document update", sentence: "Updated a document" },
  { action: "DOCUMENT_DELETE", name: "Document deletion", sentence: "Deleted a document" },
  { action: "PERMISSION_GRANT", name: "Permission granted", sentence: "Granted a permission" },
  { action: "PERMISSION_UPDATE", name: "Permission updated", sentence: "Updated a permission" },
  { action: "PERMISSION_REVOKE", name: "Permission revoked", sentence: "Revoked a permission" },
  { action: "USER_UPDATE", name: "User update", sentence: "Updated a user" },
  { action: "USER_DISABLE", name: "User disabled", sentence: "Disabled a user" },
  { action: "USER_ENABLE", name: "User enabled", sentence: "Enabled a user" },
  { action: "USER_DELETE", name: "User deletion", sentence: "Deleted a user" },
  { action: "USER_ROLE_CHANGE", name: "Role change", sentence: "Changed a user's role" },
  { action: "CATEGORY_CREATE", name: "Category created", sentence: "Created a category" },
  { action: "CATEGORY_UPDATE", name: "Category updated", sentence: "Updated a category" },
  { action: "CATEGORY_DELETE", name: "Category deleted", sentence: "Deleted a category" },
  { action: "ORG_CREATE", name: "Organization created", sentence: "Created an organization" },
  { action: "ORG_UPDATE", name: "Organization updated", sentence: "Updated an organization" },
  { action: "ORG_STATUS_CHANGE", name: "Organization status change", sentence: "Changed an organization's status" },
  { action: "ORG_MEMBER_ADD", name: "Member added", sentence: "Added a member" },
  { action: "ORG_MEMBER_UPDATE", name: "Member updated", sentence: "Updated a member" },
  { action: "ORG_MEMBER_REMOVE", name: "Member removed", sentence: "Removed a member" },
  { action: "ORG_INVITE_CREATE", name: "Invitation created", sentence: "Created an invitation" },
  { action: "ORG_INVITE_REVOKE", name: "Invitation revoked", sentence: "Revoked an invitation" },
  { action: "ORG_INVITE_ACCEPT", name: "Invitation accepted", sentence: "Accepted an invitation" },
  { action: "ORG_JOIN_REQUEST", name: "Join request", sentence: "Asked to join an organization" },
  { action: "ORG_JOIN_REVIEW", name: "Join request reviewed", sentence: "Reviewed a join request" },
  { action: "GROUP_CREATE", name: "Group created", sentence: "Created a group" },
  { action: "GROUP_UPDATE", name: "Group updated", sentence: "Updated a group" },
  { action: "GROUP_ARCHIVE", name: "Group archived", sentence: "Archived a group" },
  { action: "GROUP_CODE_ROTATE", name: "Group code renewed", sentence: "Renewed a group code" },
  { action: "GROUP_TEACHER_ASSIGN", name: "Teacher assigned", sentence: "Assigned a teacher" },
  { action: "GROUP_TEACHER_REMOVE", name: "Teacher removed", sentence: "Removed a teacher" },
  { action: "GROUP_STUDENT_ADD", name: "Student added", sentence: "Added a student" },
  { action: "GROUP_STUDENT_REMOVE", name: "Student removed", sentence: "Removed a student" },
  { action: "GROUP_JOIN_REQUEST", name: "Group join request", sentence: "Asked to join a group" },
  { action: "GROUP_JOIN_REVIEW", name: "Group request reviewed", sentence: "Reviewed a group join request" },
  { action: "DOCUMENT_SHARE_GROUP", name: "Shared with a group", sentence: "Shared a document with a group" },
  { action: "DOCUMENT_UNSHARE_GROUP", name: "Unshared from a group", sentence: "Stopped sharing a document with a group" },
  { action: "DOCUMENT_SHARE_ORG", name: "Shared with the organization", sentence: "Shared a document with the organization" },
];

const BY_ACTION = new Map(AUDIT_ACTIONS.map((entry) => [entry.action, entry]));
const humanize = (code: string) => code.replaceAll("_", " ");

/** Short label for a filter option or chip; unknown codes fall back to the readable code. */
export const auditActionName = (action: string, t: TFunction) => {
  const entry = BY_ACTION.get(action);
  return entry ? t(entry.name) : humanize(action);
};

/** Past-tense sentence for activity feeds ("Uploaded a document"). */
export const auditActionSentence = (action: string, t: TFunction) => {
  const entry = BY_ACTION.get(action);
  return entry ? t(entry.sentence) : humanize(action);
};

/** Audit target types offered as a platform-level filter. */
export const AUDIT_TARGET_TYPES: { value: string; label: TranslationKey }[] = [
  { value: "User", label: "User" },
  { value: "Document", label: "Document" },
  { value: "Category", label: "Category" },
];

/** Every entity type the API records as an audit target (organization trails included). */
const TARGET_LABEL: Record<string, TranslationKey> = {
  User: "User",
  Document: "Document",
  Category: "Category",
  Organization: "Organization",
  Group: "Group",
  OrganizationMembership: "Membership",
  OrganizationInvitation: "Invitation",
  OrganizationJoinRequest: "Join request",
  GroupJoinRequest: "Group join request",
};

export const auditTargetLabel = (type: string, t: TFunction) => (TARGET_LABEL[type] ? t(TARGET_LABEL[type]) : type);
