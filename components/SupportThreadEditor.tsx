"use client";

import { useActionState, useEffect, useState } from "react";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { editThreadAction } from "@/app/support/actions";

const textareaClass =
  "w-full rounded-md bg-card border border-rule px-3 py-2 text-[14px] text-fg " +
  "placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 " +
  "focus:ring-accent/25 transition";

export function SupportThreadEditor({
  threadId,
  title,
  body,
}: {
  threadId: string;
  title: string;
  body: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<{ error?: string; ok?: boolean }, FormData>(
    editThreadAction,
    {},
  );

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }

  return (
    <form action={action} className="rounded-xl ring-1 ring-rule bg-card p-4 space-y-3 mb-5">
      <input type="hidden" name="threadId" value={threadId} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Title" name="title" defaultValue={title} required maxLength={120} />
      <div>
        <label htmlFor="edit-body" className="block text-[13px] font-medium text-fg mb-1.5">
          Description
        </label>
        <textarea
          id="edit-body"
          name="body"
          defaultValue={body}
          required
          maxLength={4000}
          rows={6}
          className={textareaClass}
        />
      </div>
      <p className="text-[12px] text-muted">
        Edits are public: the previous version is shown in this thread&apos;s history.
      </p>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Save changes
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
