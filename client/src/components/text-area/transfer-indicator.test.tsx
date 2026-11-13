import { act, render as renderComponent, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import type { ReactElement } from "react";
import { vi } from "vitest";
import TransferIndicator from "./transfer-indicator";
import type { DocumentTransferProgress } from "../../utils/document-sync";

// jsdom does not fire CSS animation-end events. Disable Ant Design motion in
// these tests so toast dismissal can be checked without a browser animation.
const render = (component: ReactElement) => renderComponent(component, {
  wrapper: ({ children }) => (
    <ConfigProvider theme={{ token: { motion: false } }}>{children}</ConfigProvider>
  ),
});

const receiving: DocumentTransferProgress = {
  id: "transfer", phase: "receiving", receivedBytes: 1024 * 1024,
  totalBytes: 4 * 1024 * 1024,
};

test("shows one compact toast and updates its linear progress", async () => {
  const { rerender } = render(<TransferIndicator progress={receiving} />);
  expect(await screen.findByText("Receiving text… 25%")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
  expect(screen.queryByText(/MiB|left/)).not.toBeInTheDocument();
  rerender(<TransferIndicator progress={{ ...receiving, receivedBytes: 2 * 1024 * 1024 }} />);
  expect(await screen.findByText("Receiving text… 50%")).toBeInTheDocument();
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  expect(screen.queryByText("Receiving text… 25%")).not.toBeInTheDocument();
});

test("uses short labels for uploading, preparing and finishing", async () => {
  const { rerender } = render(<TransferIndicator progress={{ ...receiving, phase: "uploading" }} />);
  expect(await screen.findByText("Incoming text… 25%")).toBeInTheDocument();
  rerender(<TransferIndicator progress={{ ...receiving, phase: "preparing" }} />);
  expect(await screen.findByText("Preparing text…")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  rerender(<TransferIndicator progress={{ ...receiving, phase: "applying", receivedBytes: receiving.totalBytes! }} />);
  expect(await screen.findByText("Finishing…")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  expect(screen.queryByText("Text received")).not.toBeInTheDocument();
});

test("waits without inventing a percentage before the size is known", async () => {
  render(<TransferIndicator progress={{ id: "join", phase: "waiting", receivedBytes: 0, totalBytes: null }} />);
  expect(await screen.findByText("Syncing text…")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
});

test("clears completed toasts and removes them when the editor unmounts", async () => {
  vi.useFakeTimers();
  try {
    let view: ReturnType<typeof render>;
    await act(async () => {
      view = render(<TransferIndicator progress={{ ...receiving, phase: "complete" }} />);
    });
    expect(screen.getByText("Text received")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    await act(async () => {
      view!.rerender(<TransferIndicator progress={{ ...receiving, id: "next" }} />);
    });
    expect(screen.getByText("Receiving text… 25%")).toBeInTheDocument();
    view!.unmount();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test("clears a cancelled transfer and shows interrupted transfers briefly", async () => {
  const { rerender } = render(<TransferIndicator progress={receiving} />);
  expect(await screen.findByText("Receiving text… 25%")).toBeInTheDocument();
  rerender(<TransferIndicator progress={null} />);
  await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
  rerender(<TransferIndicator progress={{ ...receiving, phase: "interrupted" }} />);
  expect(await screen.findByText("Transfer interrupted")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
});

test("a new transfer stays open when it arrives during the completion toast", async () => {
  vi.useFakeTimers();
  try {
    let view: ReturnType<typeof render>;
    await act(async () => { view = render(<TransferIndicator progress={{ ...receiving, phase: "complete" }} />); });
    await act(async () => { view!.rerender(<TransferIndicator progress={{ ...receiving, id: "next" }} />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText("Receiving text… 25%")).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
