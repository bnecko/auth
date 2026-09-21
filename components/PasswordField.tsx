"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field } from "./Field";

type PasswordFieldProps = Omit<React.ComponentProps<typeof Field>, "type" | "trailing" | "ref"> & {
  // For a password asked for again inside a signed-in page. A password manager
  // fills a current-password field the moment the page loads, without being
  // asked, which leaves the account password sitting in the DOM of a settings
  // page where anyone at the keyboard can read it from the inspector, with no
  // OS prompt in the way. Password managers skip a read-only field, so the
  // field stays read-only until the user points at it or tabs into it. From
  // there the manager offers the saved password and the user decides. Not for
  // the sign-in form, where filling on load is the point.
  fillOnRequest?: boolean;
};

export function PasswordField({ fillOnRequest = false, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [held, setHeld] = useState(fillOnRequest);
  const inputRef = useRef<HTMLInputElement>(null);

  // A revealed password is a text input, and a browser may keep what was typed
  // into a text input and offer it back as a suggestion later. The type is
  // set on the element directly as well as in state, because the browser reads
  // the form during this event and the re-render lands after it.
  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    if (!input || !form) return;
    const hide = () => {
      input.type = "password";
      setVisible(false);
    };
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  const release = () => setHeld(false);

  return (
    <Field
      {...props}
      ref={inputRef}
      type={visible ? "text" : "password"}
      readOnly={held}
      onPointerDown={release}
      onFocus={release}
      // Revealed, this is an ordinary text box, and an ordinary text box gets
      // spell-checked, which in some browsers means sent to a server.
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      trailing={
        <button
          type="button"
          onClick={() => setVisible(current => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted transition-colors hover:text-fg"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
    />
  );
}
