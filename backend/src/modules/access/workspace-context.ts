import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which workspace the current request acts in. Set by JwtAuthGuard after it has verified
 * the caller really is an active member of the organization (the header alone is never trusted).
 * `organizationId: null` means the personal workspace.
 */
export type WorkspaceContext = { userId: number; organizationId: number | null };

const storage = new AsyncLocalStorage<WorkspaceContext>();

/**
 * Opens an (initially personal, unauthenticated) context for the whole request. Called from a
 * middleware so every later async step - guard, controller, services - shares the same object.
 */
export function runWithWorkspace<T>(next: () => T): T {
  return storage.run({ userId: -1, organizationId: null }, next);
}

/** Called by JwtAuthGuard once the caller and (if any) the organization have been verified. */
export function enterWorkspace(context: WorkspaceContext): void {
  const store = storage.getStore();
  if (store) {
    // Mutate in place: `enterWith` inside an awaited guard would not reach the handler.
    store.userId = context.userId;
    store.organizationId = context.organizationId;
  } else {
    storage.enterWith(context);
  }
}

/** The verified workspace for this user, or personal if none was established. */
export function currentWorkspace(userId: number): WorkspaceContext {
  const context = storage.getStore();
  return context && context.userId === userId ? context : { userId, organizationId: null };
}

/** Parses the X-Workspace header: "personal" (default) or "org:<id>". Returns undefined if malformed. */
export function parseWorkspaceHeader(value: string | string[] | undefined): number | null | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw === "personal") return null;
  const match = /^org:(\d{1,9})$/.exec(raw);
  return match ? Number(match[1]) : undefined;
}
