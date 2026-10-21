"use client";

import { useFormStatus } from "react-dom";
import { buttonClasses, type ButtonSize } from "./button-styles";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Label shown while the surrounding form is submitting. */
  pendingLabel?: string;
  size?: ButtonSize;
};

/** Primary button (full width by default); disables itself while its form submits. */
export function Button({ pendingLabel, size, children, disabled, type = "submit", ...props }: ButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button type={type} disabled={disabled || pending} className={buttonClasses(size)} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
