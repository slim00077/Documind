import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, ChevronDown, Plus, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useAuth } from "../../context/AuthContext";
import { ROLE_LABEL, homePath } from "../../config/roles";

/** Personal ⇄ organization switch. Rendered only for people who belong to at least one organization. */
export default function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const { memberships, current, selectOrg } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => ref.current && !ref.current.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, []);

  if (memberships.length === 0) return null;

  const go = (organizationId: number | null) => {
    selectOrg(organizationId);
    setOpen(false);
    navigate(organizationId === null ? homePath(user?.role) : `/org/${organizationId}`);
  };

  return (
    <div className="user-menu workspace-switcher" ref={ref}>
      <button className="user-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t("Switch workspace")} onClick={() => setOpen((v) => !v)}>
        {current ? <Building2 aria-hidden="true" /> : <User aria-hidden="true" />}
        <span className="ws-label">{current ? current.organization.name : t("Personal")}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="menu-panel" role="menu">
          <div className="menu-head"><span>{t("Workspace")}</span></div>
          <button className="menu-item" role="menuitemradio" aria-checked={!current} type="button" onClick={() => go(null)}>
            <User aria-hidden="true" /> {t("Personal workspace")} {!current ? <Check className="ws-check" aria-hidden="true" /> : null}
          </button>
          <div className="menu-sep" />
          {memberships.map((m) => (
            <button key={m.membershipId} className="menu-item" role="menuitemradio" aria-checked={current?.organization.id === m.organization.id} type="button" onClick={() => go(m.organization.id)}>
              <Building2 aria-hidden="true" />
              <span className="ws-item"><span>{m.organization.name}</span><small>{t(ROLE_LABEL[m.role])}</small></span>
              {current?.organization.id === m.organization.id ? <Check className="ws-check" aria-hidden="true" /> : null}
            </button>
          ))}
          <div className="menu-sep" />
          <button className="menu-item" role="menuitem" type="button" onClick={() => { setOpen(false); navigate("/app/join"); }}><Plus aria-hidden="true" /> {t("Join another organization")}</button>
        </div>
      ) : null}
    </div>
  );
}
