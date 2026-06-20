"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { Identicon } from "@/components/Identicon";
import {
  updateProfileAction,
  requestIdentityChangeAction,
  type ProfileFormState,
} from "./actions";

const PRESET_COUNT = 8;

const textareaClass =
  "w-full rounded-md bg-card border border-rule px-3 py-2 text-[14px] text-fg " +
  "placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 " +
  "focus:ring-accent/25 transition";

export function ProfileEditForm({
  publicId,
  firstName,
  bio,
  avatarPreset,
}: {
  publicId: string;
  firstName: string;
  bio: string | null;
  avatarPreset: number | null;
}) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    updateProfileAction,
    {},
  );
  // null = derive from public_id (default); 0..N = explicit preset
  const [selected, setSelected] = useState<number | null>(avatarPreset);

  return (
    <form action={action} className="space-y-5 px-4 py-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && <Alert tone="success">Profile saved</Alert>}

      <Field label="First name" name="firstName" defaultValue={firstName} required maxLength={80} />

      <div>
        <label htmlFor="bio" className="block text-[13px] font-medium text-fg mb-1.5">
          Bio <span className="text-muted font-normal">(public)</span>
        </label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={bio || ""}
          maxLength={240}
          rows={3}
          placeholder="A short line about you"
          className={textareaClass}
        />
      </div>

      <div>
        <span className="block text-[13px] font-medium text-fg mb-2">Avatar</span>
        <input type="hidden" name="avatarPreset" value={selected ?? ""} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-pressed={selected === null}
            title="Default (from your account id)"
            className={`rounded-md p-0.5 ring-2 transition-colors ${
              selected === null ? "ring-accent" : "ring-transparent hover:ring-rule"
            }`}
          >
            <Identicon seed={publicId} preset={null} size={40} />
          </button>
          {Array.from({ length: PRESET_COUNT }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={selected === i}
              className={`rounded-md p-0.5 ring-2 transition-colors ${
                selected === i ? "ring-accent" : "ring-transparent hover:ring-rule"
              }`}
            >
              <Identicon seed={publicId} preset={i} size={40} />
            </button>
          ))}
        </div>
      </div>

      <Button type="submit" size="sm" loading={pending}>
        Save profile
      </Button>
    </form>
  );
}

export function IdentityChangeForm({
  field,
  current,
  hasTelegram,
}: {
  field: "username" | "email";
  current: string;
  hasTelegram: boolean;
}) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    requestIdentityChangeAction,
    {},
  );

  if (!hasTelegram) {
    return (
      <div className="px-4 py-3 text-[13px] text-muted">
        Link Telegram to change your {field}.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 px-4 py-4">
      <input type="hidden" name="field" value={field} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.ok && state.field === field && (
        <Alert tone="success">
          Check Telegram and approve the change. It applies once you confirm.
        </Alert>
      )}
      <Field
        label={`New ${field}`}
        name="newValue"
        type={field === "email" ? "email" : "text"}
        placeholder={field === "email" ? "you@example.com" : "new_username"}
        defaultValue=""
        required
      />
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
      />
      <p className="text-[12px] text-muted">
        Current {field}: <span className="text-secondary">{current}</span>. Changing it needs
        your password and a Telegram approval.
      </p>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        Request {field} change
      </Button>
    </form>
  );
}
