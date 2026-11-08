/** Layered, fixed backdrop: soft aurora blobs drifting slowly, a fine grid and a dot texture. Pure CSS. */
export default function AnimatedBackground({ variant = "landing" }: { variant?: "landing" | "app" }) {
  return (
    <div className={`aurora aurora-${variant}`} aria-hidden="true">
      <span className="aurora-blob a1" />
      <span className="aurora-blob a2" />
      <span className="aurora-blob a3" />
      <span className="aurora-grid" />
      <span className="aurora-dots" />
    </div>
  );
}
