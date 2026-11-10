import { useEffect, useRef, useState, type FormEvent } from "react";
import { KeyRound, LogOut, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { fetchLogoUrl, orgApi, type OrganizationType } from "../../services/organizations.api";
import ConfirmDialog from "../../components/documents/ConfirmDialog";
import { useToast } from "../../components/ui/ToastProvider";
import { CopyField, ErrorNote, Field, formatDate, messageOf, useAsync } from "../../components/org/OrgUi";
import { useOrg } from "./OrgLayout";
import { ORG_TYPE_OPTIONS as TYPES } from "../../config/organizations";
import { ROLE_LABEL } from "../../config/roles";

export default function OrgSettingsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId } = useOrg();
  const { refresh, selectOrg } = useWorkspace();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: org, error, isLoading, reload } = useAsync(() => orgApi.get(token!, orgId), [token, orgId]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<OrganizationType>("OTHER");
  const [discoverable, setDiscoverable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveError, setLeaveError] = useState("");

  useEffect(() => {
    if (!org) return;
    setName(org.name);
    setDescription(org.description ?? "");
    setType(org.organizationType);
    setDiscoverable(Boolean(org.isDiscoverable));
  }, [org]);

  useEffect(() => {
    let url: string | null = null;
    if (token && org?.hasLogo) void fetchLogoUrl(token, orgId).then((u) => { url = u; setLogoUrl(u); });
    else setLogoUrl(null);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [token, orgId, org?.hasLogo]);

  if (error) return <ErrorNote message={error} onRetry={() => void reload()} />;
  if (isLoading || !org) return <p className="auth-hint">{t("Loading...")}</p>;
  const isAdmin = org.myRole === "ADMIN";

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await orgApi.update(token!, orgId, { name, description, organizationType: type, isDiscoverable: discoverable });
      await Promise.all([reload(), refresh()]);
      showToast(t("Organization updated."), "success");
    } catch (e) {
      showToast(messageOf(e, t("Unable to save.")), "error");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      await orgApi.uploadLogo(token!, orgId, file);
      await reload();
      showToast(t("Logo updated."), "success");
    } catch (e) {
      showToast(messageOf(e, t("Unable to upload the logo.")), "error");
    }
  };

  const rotate = async () => {
    try {
      await orgApi.rotateCode(token!, orgId);
      await reload();
      showToast(t("New organization code generated. The old one no longer works."), "success");
    } catch (e) {
      showToast(messageOf(e, t("Unable to rotate the code.")), "error");
    }
  };

  const leave = async () => {
    try {
      await orgApi.leave(token!, orgId);
      selectOrg(null);
      await refresh();
      showToast(t("You left the organization. Your personal workspace is unchanged."), "success");
      navigate("/app/dashboard", { replace: true });
    } catch (e) {
      setLeaveError(messageOf(e, t("Unable to leave.")));
    }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">{t("Organization")}</p>
          <h1>{isAdmin ? t("Organization profile") : org.name}</h1>
          <p>{isAdmin ? t("How your organization appears to its members.") : t("About this organization.")}</p>
        </div>
      </div>

      <div className="dash-grid">
        <article className="workspace-panel">
          {isAdmin ? (
            <form className="org-form" onSubmit={save}>
              <Field label={t("Name")}><input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} /></Field>
              <Field label={t("Type")}>
                <select className="auth-input filter-select" value={type} onChange={(e) => setType(e.target.value as OrganizationType)}>
                  {TYPES.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                </select>
              </Field>
              <Field label={t("Description")}><textarea className="auth-input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></Field>
              <label className="org-check">
                <input type="checkbox" checked={discoverable} onChange={(e) => setDiscoverable(e.target.checked)} />
                <span>{t("List this organization in \"Discover organizations\" so people can ask to join. Otherwise it is found only by its code.")}</span>
              </label>
              <div className="form-actions"><button className="button button-primary" disabled={saving}>{saving ? t("Saving...") : t("Save changes")}</button></div>
            </form>
          ) : (
            <dl className="insights-list">
              <div><dt>{t("Type")}</dt><dd>{t(TYPES.find((option) => option.value === org.organizationType)?.label ?? "Other")}</dd></div>
              <div><dt>{t("Your role")}</dt><dd>{t(ROLE_LABEL[org.myRole])}</dd></div>
              <div><dt>{t("Created")}</dt><dd>{formatDate(org.createdAt)}</dd></div>
              {org.description ? <p className="meta">{org.description}</p> : null}
            </dl>
          )}
        </article>

        <div className="page-stack">
          <article className="workspace-panel">
            <div className="panel-head"><h2>{t("Logo")}</h2></div>
            <div className="org-logo-row">
              <span className="org-logo">{logoUrl ? <img src={logoUrl} alt={t("{{name}} logo", { name: org.name })} /> : org.name.slice(0, 1).toUpperCase()}</span>
              {isAdmin ? (
                <>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
                  <button className="button button-secondary" type="button" onClick={() => fileRef.current?.click()}><Upload /> {t("Upload logo")}</button>
                </>
              ) : null}
            </div>
            {isAdmin ? <p className="meta">{t("PNG, JPG or WebP, up to 1 MB.")}</p> : null}
          </article>

          {isAdmin ? (
            <article className="workspace-panel">
              <div className="panel-head"><h2>{t("Organization code")}</h2></div>
              <p className="meta">{t("People can use this code to ask to join. You approve every request.")}</p>
              {org.joinCode ? <CopyField value={org.joinCode} label={t("Organization code")} /> : null}
              <div className="form-actions"><button className="button button-secondary" type="button" onClick={rotate}><KeyRound /> {t("Generate a new code")}</button></div>
            </article>
          ) : (
            <article className="workspace-panel">
              <div className="panel-head"><h2>{t("Membership")}</h2></div>
              <p className="meta">{t("Leaving ends your access to this organization's groups and shared documents. Your personal documents, conversations and settings stay exactly as they are.")}</p>
              <div className="form-actions"><button className="button button-danger" type="button" onClick={() => setConfirmLeave(true)}><LogOut /> {t("Leave organization")}</button></div>
            </article>
          )}
        </div>
      </div>

      {confirmLeave ? (
        <ConfirmDialog title={t("Leave this organization?")} message={t("You will lose access to its groups and shared documents. Your personal workspace is not affected.")} confirmLabel={t("Leave")} error={leaveError} onConfirm={() => void leave()} onCancel={() => { setConfirmLeave(false); setLeaveError(""); }} />
      ) : null}
    </section>
  );
}
