"use client";

import { useActionState } from "react";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { createThreadAction } from "../actions";

const selectClass =
  "w-full h-10 px-3 text-[14px] rounded-md bg-card text-fg border border-rule " +
  "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 transition";

export function NewThreadForm() {
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(
    createThreadAction,
    {},
  );

  return (
    <form action={action} className="space-y-5">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field
        label="Title"
        name="title"
        required
        maxLength={120}
        placeholder="Short summary of the issue or request"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="kind"
            className="block text-[13px] font-medium text-fg mb-1.5"
          >
            Type
          </label>
          <select id="kind" name="kind" defaultValue="issue" className={selectClass}>
            <option value="issue">Issue — community report or question</option>
            <option value="ticket">Ticket — request handled by support</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="visibility"
            className="block text-[13px] font-medium text-fg mb-1.5"
          >
            Visibility
          </label>
          <select
            id="visibility"
            name="visibility"
            defaultValue="public"
            className={selectClass}
          >
            <option value="public">Public — anyone can read</option>
            <option value="private">Private — only you and support</option>
          </select>
        </div>
      </div>

      <div>
        <label
          htmlFor="body"
          className="block text-[13px] font-medium text-fg mb-1.5"
        >
          Description
        </label>
        <textarea
          id="body"
          name="body"
          required
          maxLength={4000}
          rows={7}
          placeholder="Describe the problem, what you expected, and any steps to reproduce."
          className="w-full rounded-md bg-card border border-rule px-3 py-2 text-[14px] text-fg placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 transition"
        />
      </div>

      <Button type="submit" size="sm" loading={pending}>
        Create thread
      </Button>
    </form>
  );
}
