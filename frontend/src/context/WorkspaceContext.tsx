import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { orgApi, type MyMembership } from "../services/organizations.api";
import { WORKSPACE_INVALID_EVENT, setActiveOrgId } from "../config/workspace";

type WorkspaceValue = {
  memberships: MyMembership[];
  /** Selected organization workspace, or null for the personal workspace. */
  current: MyMembership | null;
  isLoading: boolean;
  selectOrg: (organizationId: number | null) => void;
  refresh: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceValue | undefined>(undefined);
const storageKey = (userId: number) => `documind_workspace_${userId}`;

const readStored = (userId: number): number | null => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? Number(raw) || null : null;
  } catch {
    return null;
  }
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [memberships, setMemberships] = useState<MyMembership[]>([]);
  const [orgId, setOrgId] = useState<number | null>(null);
  // Which account the memberships were loaded for. Until it matches, routes must wait, not redirect.
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setMemberships(await orgApi.mine(token));
    } catch {
      setMemberships([]);
    }
  }, [token]);

  // Load memberships whenever the signed-in account changes.
  useEffect(() => {
    if (!token || !user) {
      setMemberships([]);
      setOrgId(null);
      setActiveOrgId(null);
      setLoadedFor(null);
      return;
    }
    setOrgId(readStored(user.id));
    void refresh().finally(() => setLoadedFor(user.id));
  }, [token, user, refresh]);

  const current = useMemo(() => memberships.find((m) => m.organization.id === orgId) ?? null, [memberships, orgId]);

  // The header is only ever sent for a workspace the user verifiably belongs to. Set during render
  // (not in an effect): child effects run before the provider's, and a page's first fetch must
  // already carry the right workspace. It is an idempotent module variable, so this is safe.
  setActiveOrgId(current ? current.organization.id : null);

  // Membership vanished (suspended/removed) while the tab was open.
  useEffect(() => {
    const onInvalid = () => {
      setOrgId(null);
      setActiveOrgId(null);
      void refresh();
    };
    window.addEventListener(WORKSPACE_INVALID_EVENT, onInvalid);
    return () => window.removeEventListener(WORKSPACE_INVALID_EVENT, onInvalid);
  }, [refresh]);

  const selectOrg = useCallback(
    (organizationId: number | null) => {
      setOrgId(organizationId);
      if (user) {
        try {
          if (organizationId === null) localStorage.removeItem(storageKey(user.id));
          else localStorage.setItem(storageKey(user.id), String(organizationId));
        } catch {
          /* storage unavailable: the choice just won't persist */
        }
      }
    },
    [user],
  );

  const isLoading = Boolean(token && user) && loadedFor !== user?.id;
  const value = useMemo(() => ({ memberships, current, isLoading, selectOrg, refresh }), [memberships, current, isLoading, selectOrg, refresh]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return context;
}
