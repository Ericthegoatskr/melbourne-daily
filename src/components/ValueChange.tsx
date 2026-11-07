import type { ReactNode } from "react";
import "./ValueChange.css";

/** Animate the rendered reading, never generate intermediate or invented values. */
export default function ValueChange({
  value,
  children,
  className = "",
}: {
  value: string | number;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span key={value} className={`value-change ${className}`.trim()}>
      {children ?? value}
    </span>
  );
}
