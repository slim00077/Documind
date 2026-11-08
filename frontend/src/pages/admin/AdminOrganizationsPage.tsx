import { useState } from "react";
import { Building2, Plus, Search } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { orgApi, type IssuedInvitation, type OrganizationType, type PlatformOrg } from "../../services/organizations.api";
import { PageState } from "../../components/ui/PageState";
import ConfirmDialog from "../../components/documents/ConfirmDialog";
import { useToast } from "../../components/ui/ToastProvider";
import { Badge, CopyField, ErrorNote, Field, FormModal, Modal, Pagination, formatDate, messageOf, useAsync, useDebounced } from "../../components/org/OrgUi";

const TYPES: { value: OrganizationType; label: string }[] = [
  { value: "SCHOOL", label: "School" }, { value: "UNIVERSITY", label: "University" }, { value: "TRAINING_CENTER", label: "Training center" },
  { value: "COMPANY", label: "Company" }, { value: "OTHER", label: "Other" },
];

/** Platform administration: create organizations and suspend them. This grants no access to their content. */
export default function AdminOrganizationsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [creating, setCreating] = useState(false);
  const [invite, setInvite] = useState<IssuedInvitation | null>(null);
  const [toggle, setToggle] = useState<PlatformOrg | null>(null);
  const [addAdminFor, setAddAdminFor] = useState<PlatformOrg | null>(null);

  const { data, error, isLoading, reload } = useAsync(() => orgApi.platformOrgs(token!, { page, pageSize: 15, search: debounced }), [token, page, debounced]);

  const confirmToggle = async () => {
    if (!toggle) return;
    try {
      await orgApi.platformSetStatus(token!, toggle.id, toggle.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");
      showToast(toggle.status === "ACTIVE" ? "Organization suspended." : "Organization reactivated.", "success");
      setToggle(null);
      void reload();
    } catch (e) { showToast(messageOf(e, "Unable to change the status."), "error"); }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div><p className="section-kicker">Admin</p><h1>Organizations</h1><p>Create organizations and name their first administrator. Each organization's people and documents stay private to it.</p></div>
        <button className="button button-primary" onClick={() => setCreating(true)}><Plus /> New organization</button>
      </div>
      <label className="search-field"><Search /><input type="search" placeholder="Search organizations" aria-label="Search organizations" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>

      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : isLoading && !data ? <p className="auth-hint">Loading...</p> : !data || data.items.length === 0 ? (
        <PageState icon={Building2} title="No organizations" message="Create the first one to let a school or company collaborate in DocuMind." />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Organization</th><th>Type</th><th>Admins</th><th>Teachers</th><th>Students</th><th>Groups</th><th>Status</th><th>Created</th><th></th></tr></thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.name}</strong><div className="meta">{o.slug}</div></td><td>{TYPES.find((t) => t.value === o.organizationType)?.label}</td>
                    <td>{o.admins}</td><td>{o.teachers}</td><td>{o.students}</td><td>{o.groups}</td><td><Badge value={o.status} /></td><td>{formatDate(o.createdAt)}</td>
                    <td><div className="org-row-actions">
                      <button className="button button-secondary" onClick={() => setAddAdminFor(o)}>Add admin</button>
                      <button className="button button-secondary" onClick={() => setToggle(o)}>{o.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </>
      )}

      {creating ? <CreateModal onClose={() => setCreating(false)} onDone={(inv) => { setCreating(false); if (inv) setInvite(inv); showToast("Organization created.", "success"); void reload(); }} /> : null}
      {addAdminFor ? <AddAdminModal org={addAdminFor} onClose={() => setAddAdminFor(null)} onDone={(inv) => { setAddAdminFor(null); if (inv) setInvite(inv); else showToast("Administrator added.", "success"); void reload(); }} /> : null}
      {invite ? (
        <Modal title="Administrator invitation" onClose={() => setInvite(null)}>
          <p className="meta">No account exists for <strong>{invite.email}</strong> yet. Email delivery is not configured, so send them this one-time link. They sign up (or sign in) with that exact email to become the administrator.</p>
          <CopyField value={invite.url} label="Invitation link" />
          <div className="form-actions"><button className="button button-primary" onClick={() => setInvite(null)}>Done</button></div>
        </Modal>
      ) : null}
      {toggle ? (
        <ConfirmDialog title={toggle.status === "ACTIVE" ? `Suspend ${toggle.name}?` : `Reactivate ${toggle.name}?`}
          message={toggle.status === "ACTIVE" ? "Every member immediately loses access to this organization's groups and shared documents. Nothing is deleted and personal workspaces are untouched." : "Members regain access."}
          confirmLabel={toggle.status === "ACTIVE" ? "Suspend" : "Reactivate"} onConfirm={() => void confirmToggle()} onCancel={() => setToggle(null)} />
      ) : null}
    </section>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: (invitation: IssuedInvitation | null) => void }) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [type, setType] = useState<OrganizationType>("SCHOOL");
  const [description, setDescription] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [discoverable, setDiscoverable] = useState(false);
  return (
    <FormModal title="New organization" submitLabel="Create organization" onClose={onClose} wide
      onSubmit={async () => { const r = await orgApi.platformCreate(token!, { name, organizationType: type, description: description || undefined, isDiscoverable: discoverable, adminEmail: adminEmail || undefined }); onDone(r.invitation); }}>
      <Field label="Name"><input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} autoFocus /></Field>
      <div className="org-two-col">
        <Field label="Type"><select className="auth-input filter-select" value={type} onChange={(e) => setType(e.target.value as OrganizationType)}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
        <Field label="First administrator's email" hint="An existing account is added at once; otherwise you get an invitation link."><input className="auth-input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} /></Field>
      </div>
      <Field label="Description (optional)"><textarea className="auth-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></Field>
      <label className="org-check"><input type="checkbox" checked={discoverable} onChange={(e) => setDiscoverable(e.target.checked)} /><span>List in "Open organizations" so people can ask to join (otherwise code or invitation only)</span></label>
    </FormModal>
  );
}

function AddAdminModal({ org, onClose, onDone }: { org: PlatformOrg; onClose: () => void; onDone: (invitation: IssuedInvitation | null) => void }) {
  const { token } = useAuth();
  const [email, setEmail] = useState("");
  return (
    <FormModal title={`Add an administrator to ${org.name}`} submitLabel="Add administrator" onClose={onClose} onSubmit={async () => { const r = await orgApi.platformAddAdmin(token!, org.id, email); onDone(r.invitation); }}>
      <Field label="Email"><input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
    </FormModal>
  );
}
