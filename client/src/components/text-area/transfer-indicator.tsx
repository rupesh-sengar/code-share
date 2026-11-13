import { useEffect } from "react";
import { message, Progress } from "antd";
import type { DocumentTransferProgress } from "../../utils/document-sync";

const MESSAGE_KEY = "incoming-document";
const TRANSFER_GRADIENT = {
  "0%": "var(--primary-color, #743d7c)",
  "100%": "color-mix(in srgb, var(--primary-color, #743d7c) 40%, var(--accent-color, #e2e283))",
};

// Keep the portal inside the app so it inherits the active palette variables.
const getToastContainer = () => document.querySelector<HTMLElement>(".app") ?? document.body;

export default function TransferIndicator({ progress }: { progress: DocumentTransferProgress | null }) {
  const [api, contextHolder] = message.useMessage({ top: 72, maxCount: 1, getContainer: getToastContainer });

  useEffect(() => () => api.destroy(MESSAGE_KEY), [api]);

  useEffect(() => {
    if (!progress) {
      api.destroy(MESSAGE_KEY);
      return;
    }
    const { phase, totalBytes, receivedBytes } = progress;
    const labels = {
      waiting: "Syncing text…",
      uploading: "Incoming text…",
      preparing: "Preparing text…",
      receiving: "Receiving text…",
      applying: "Finishing…",
      complete: "Text received",
      interrupted: "Transfer interrupted",
    };
    const knownTotal = totalBytes !== null && totalBytes > 0;
    const percentage = phase === "complete" ? 100 : knownTotal
      ? Math.max(0, Math.min(100, Math.floor(receivedBytes / totalBytes * 100))) : 0;
    const showPercentage = knownTotal && (phase === "uploading" || phase === "receiving");
    const determinate = showPercentage || phase === "complete" || (knownTotal && phase === "interrupted");
    const label = `${labels[phase]}${showPercentage ? ` ${percentage}%` : ""}`;

    api.open({
      key: MESSAGE_KEY,
      className: "editor-transfer-toast",
      icon: null,
      duration: 0,
      pauseOnHover: false,
      content: (
        <div className="editor-transfer-content">
          <span className="editor-transfer-label" role="status" aria-live="polite">{label}</span>
          <div
            role="progressbar"
            aria-label="Incoming text progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={determinate ? percentage : undefined}
            aria-valuetext={label}
          >
            <div aria-hidden="true">
              <Progress
                type="line"
                percent={determinate ? percentage : 100}
                status={phase === "complete" ? "success" : phase === "interrupted" ? "exception" : "active"}
                strokeColor={phase === "interrupted" ? undefined : phase === "complete"
                  ? "var(--accent-color, #e2e283)" : TRANSFER_GRADIENT}
                railColor="color-mix(in srgb, var(--text-color, #fafafa) 10%, transparent)"
                showInfo={false}
                size={["100%", 4]}
              />
            </div>
          </div>
        </div>
      ),
    });
    // Keep one persistent toast while updating it. A new transfer cancels the
    // terminal-state timer instead of inheriting a previous auto-close timer.
    if (phase === "complete" || phase === "interrupted") {
      const timer = setTimeout(() => api.destroy(MESSAGE_KEY), phase === "complete" ? 2000 : 4000);
      return () => clearTimeout(timer);
    }
  }, [api, progress]);

  return contextHolder;
}
