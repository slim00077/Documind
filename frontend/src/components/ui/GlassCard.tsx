import type { HTMLAttributes, ReactNode } from "react";
import InteractiveSpotlight from "./InteractiveSpotlight";

export type GlassTone = "violet" | "cyan" | "blue" | "lavender";

type Props = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article";
  /** Accent used for the edge light and glow. */
  tone?: GlassTone;
  /** Up to 2deg of 3D movement toward the pointer. */
  tilt?: boolean;
  children?: ReactNode;
};

/** Translucent surface with a lit edge and pointer-reactive highlight. Use for showcase surfaces, not dense data. */
export default function GlassCard({ tone = "violet", tilt = false, className = "", children, ...rest }: Props) {
  return (
    <InteractiveSpotlight tilt={tilt} className={`glass-card tone-${tone} ${className}`.trim()} {...rest}>
      {children}
    </InteractiveSpotlight>
  );
}
