import { useEffect, useState } from "react";
import type { DocumentTransferProgress } from "../../utils/document-sync";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export default function TransferIndicator({ progress }: { progress: DocumentTransferProgress | null }) {
  const [dismissed, setDismissed] = useState(false);
  const id = progress?.id;
  const phase = progress?.phase;

  useEffect(() => {
    setDismissed(false);
    if (phase === "complete" || phase === "interrupted") {
      const timer = setTimeout(() => setDismissed(true), phase === "complete" ? 2000 : 6000);
      return () => clearTimeout(timer);
    }
  }, [id, phase]);

  if (!progress || (dismissed && (phase === "complete" || phase === "interrupted"))) return null;

  const labels = {
    waiting: "Loading shared text…",
    uploading: "Incoming text · Sender uploading",
    preparing: "Incoming text · Preparing…",
    receiving: "Receiving text…",
    applying: "Finishing…",
    complete: "Text received",
    interrupted: "Incoming transfer interrupted",
  };
  const knownTotal = progress.totalBytes !== null && progress.totalBytes > 0;
  const percentage = knownTotal
    ? Math.min(100, Math.floor(progress.receivedBytes / progress.totalBytes! * 100))
    : 0;
  const showPercentage = phase === "uploading" || phase === "receiving";
  const remaining = Math.max(0, (progress.totalBytes ?? 0) - progress.receivedBytes);
  const detail = phase === "applying"
    ? "All data received. Updating the editor…"
    : phase === "preparing"
      ? "Upload complete. Waiting for the server…"
      : phase === "interrupted"
        ? "Waiting for the sender to retry."
        : phase === "complete"
          ? `${formatBytes(progress.receivedBytes)} received`
          : knownTotal
            ? `${formatBytes(progress.receivedBytes)} of ${formatBytes(progress.totalBytes!)} · ${formatBytes(remaining)} left`
            : "Waiting for incoming text…";

  return (
    <section className={`editor-transfer editor-transfer-${phase}`} aria-label="Incoming text transfer">
      <div className="editor-transfer-heading">
        <span role="status" aria-live="polite">{labels[progress.phase]}</span>
        {showPercentage && knownTotal && <strong>{percentage}%</strong>}
        {phase === "complete" && <span aria-hidden="true">✓</span>}
      </div>
      <progress
        aria-label={phase === "uploading" ? "Sender upload progress" : "Incoming text progress"}
        max={100}
        value={showPercentage && knownTotal ? percentage : phase === "complete" ? 100 : undefined}
      />
      <p>{detail}</p>
    </section>
  );
}
