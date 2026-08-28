"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Section } from "@/components/Section";
import { deleteAppAction, setAppFrozenAction, updateAppAction } from "./actions";

export function AppDangerZone({
  appId,
  slug,
  status,
}: {
  appId: number;
  slug: string;
  status: "active" | "frozen" | "disabled";
}) {
  const [secret, setSecret] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  async function rotate(formData: FormData) {
    const isKeyRotation = formData.get("action") === "rotate_api_key";
    setBusy(isKeyRotation ? "rotate_key" : "rotate");
    setError("");
    // Clear only what this action can replace: a standalone api key rotation
    // must not wipe a still-uncopied client secret from the screen.
    if (!isKeyRotation) setSecret("");
    setApiKey("");
    try {
      const result = await updateAppAction(formData);
      if (result && "clientSecret" in result && result.clientSecret) {
        setSecret(result.clientSecret);
      }
      if (result && "apiKey" in result && result.apiKey) {
        setApiKey(result.apiKey);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to rotate");
    } finally {
      setBusy("");
    }
  }

  async function toggleFrozen(formData: FormData) {
    setBusy("freeze");
    setError("");
    try {
      await setAppFrozenAction(formData);
      setFreezeOpen(false);
    } catch (err) {
      setFreezeOpen(false);
      setError(err instanceof Error ? err.message : "failed to update app status");
    } finally {
      setBusy("");
    }
  }

  async function remove(formData: FormData) {
    setBusy("delete");
    setError("");
    try {
      await deleteAppAction(formData);
      // Success redirects to /developers/apps; nothing to reset here.
    } catch (err) {
      setDeleteOpen(false);
      setError(err instanceof Error ? err.message : "failed to delete app");
      setBusy("");
    }
  }

  const frozen = status === "frozen";

  return (
    <div className="space-y-2">
      {error && <Alert tone="danger">{error}</Alert>}
      {secret && (
        <Alert tone="warning">
          <div className="mb-1.5 text-[13px] font-medium">New client secret</div>
          <code className="block font-mono select-all text-accent-strong break-all">
            {secret}
          </code>
        </Alert>
      )}
      {apiKey && (
        <Alert tone="warning">
          <div className="mb-1.5 text-[13px] font-medium">New API key</div>
          <code className="block font-mono select-all text-accent-strong break-all">
            {apiKey}
          </code>
          {secret && (
            <p className="mt-1.5 text-[12px]">
              This app shared one credential for both surfaces, so both were
              rotated together. The old value no longer works as an API key;
              as a client secret it expires after the 7-day grace window.
            </p>
          )}
        </Alert>
      )}

      <Section
        index="4.0"
        title="Danger zone"
        hint="Destructive operations"
        icon={TriangleAlert}
        tone="danger"
      >
        <div className="flex items-center justify-between py-3 px-1 gap-4">
          <div className="min-w-0">
            <div className="text-[14px] text-fg mb-1">Rotate client secret</div>
            <div className="text-[13px] text-muted">
              The previous secret remains valid for 7 days.
            </div>
          </div>
          <form action={rotate}>
            <input type="hidden" name="app_id" value={appId} />
            <input type="hidden" name="action" value="rotate_secret" />
            <Button type="submit" variant="danger" size="sm" loading={busy === "rotate"}>
              {busy === "rotate" ? "Rotating…" : "Rotate"}
            </Button>
          </form>
        </div>

        <div className="flex items-center justify-between py-3 px-1 gap-4 border-t border-rule">
          <div className="min-w-0">
            <div className="text-[14px] text-fg mb-1">Rotate API key</div>
            <div className="text-[13px] text-muted">
              The previous key stops working immediately.
            </div>
          </div>
          <form action={rotate}>
            <input type="hidden" name="app_id" value={appId} />
            <input type="hidden" name="action" value="rotate_api_key" />
            <Button type="submit" variant="danger" size="sm" loading={busy === "rotate_key"}>
              {busy === "rotate_key" ? "Rotating…" : "Rotate"}
            </Button>
          </form>
        </div>

        <div className="flex items-center justify-between py-3 px-1 gap-4 border-t border-rule">
          <div className="min-w-0">
            <div className="text-[14px] text-fg mb-1">
              {frozen ? "Unfreeze app" : "Freeze app"}
            </div>
            <div className="text-[13px] text-muted">
              {status === "disabled"
                ? "This app was disabled by an administrator and cannot be re-enabled here."
                : frozen
                  ? "The app is frozen: sign-ins, issued tokens, and API access are suspended."
                  : "Suspends sign-ins, issued tokens, and API access until you unfreeze it. Nothing is deleted."}
            </div>
          </div>
          {status !== "disabled" && (
            <Button
              type="button"
              variant={frozen ? "secondary" : "danger"}
              size="sm"
              onClick={() => setFreezeOpen(true)}
            >
              {frozen ? "Unfreeze" : "Freeze"}
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between py-3 px-1 gap-4 border-t border-rule">
          <div className="min-w-0">
            <div className="text-[14px] text-fg mb-1">Delete app</div>
            <div className="text-[13px] text-muted">
              Permanently deletes the app with its client secret, API key, issued
              tokens, webhook endpoints, and user authorizations.
            </div>
          </div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => {
              setDeleteConfirm("");
              setDeleteOpen(true);
            }}
          >
            Delete app
          </Button>
        </div>
      </Section>

      <ConfirmDialog
        open={freezeOpen}
        title={frozen ? "Unfreeze this app?" : "Freeze this app?"}
        message={
          frozen
            ? "Sign-ins, previously issued tokens, and API access start working again immediately."
            : "Users cannot sign in with this app while it is frozen, issued tokens stop working, and its API key is rejected. You can unfreeze it at any time."
        }
        tone={frozen ? "neutral" : "danger"}
        confirmLabel={frozen ? "Unfreeze" : "Freeze"}
        busy={busy === "freeze"}
        formId="app-freeze-form"
        onClose={() => setFreezeOpen(false)}
      >
        <form id="app-freeze-form" action={toggleFrozen}>
          <input type="hidden" name="app_id" value={appId} />
          <input type="hidden" name="frozen" value={frozen ? "0" : "1"} />
        </form>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this app?"
        message="This permanently deletes the app, its credentials, every issued token, webhook endpoints, and user authorizations. This cannot be undone."
        tone="danger"
        confirmLabel="Delete app"
        busy={busy === "delete"}
        confirmDisabled={deleteConfirm.trim() !== slug}
        formId="app-delete-form"
        onClose={() => setDeleteOpen(false)}
      >
        <form id="app-delete-form" action={remove}>
          <input type="hidden" name="app_id" value={appId} />
          <label className="mt-3 block text-[13px] text-muted">
            Type <code className="font-mono text-fg select-all">{slug}</code> to confirm
            <input
              name="confirm"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full mt-1 rounded-md bg-card border border-rule px-2.5 py-2 text-[13px] text-fg placeholder:text-faint focus:outline-none focus:border-accent transition-colors"
            />
          </label>
        </form>
      </ConfirmDialog>
    </div>
  );
}
