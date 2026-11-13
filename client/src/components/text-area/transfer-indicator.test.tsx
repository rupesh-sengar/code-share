import { act, render, screen } from "@testing-library/react";
import TransferIndicator from "./transfer-indicator";
import type { DocumentTransferProgress } from "../../utils/document-sync";

const receiving: DocumentTransferProgress = {
  id: "transfer", phase: "receiving", receivedBytes: 1024 * 1024,
  totalBytes: 4 * 1024 * 1024,
};

test("shows the received percentage and remaining data", () => {
  render(<TransferIndicator progress={receiving} />);
  expect(screen.getByText("25%")).toBeInTheDocument();
  expect(screen.getByText("1.0 MiB of 4.0 MiB · 3.0 MiB left")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "25");
});

test("separates the sender upload, server wait, and editor apply stages", () => {
  const { rerender } = render(<TransferIndicator progress={{ ...receiving, phase: "uploading" }} />);
  expect(screen.getByText("Incoming text · Sender uploading")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Sender upload progress" })).toHaveAttribute("value", "25");
  rerender(<TransferIndicator progress={{ ...receiving, phase: "preparing" }} />);
  expect(screen.getByText("Upload complete. Waiting for the server…")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
  rerender(<TransferIndicator progress={{ ...receiving, phase: "applying", receivedBytes: receiving.totalBytes! }} />);
  expect(screen.getByText("Finishing…")).toBeInTheDocument();
  expect(screen.getByText("All data received. Updating the editor…")).toBeInTheDocument();
  expect(screen.queryByText("Text received")).not.toBeInTheDocument();
});

test("waits without inventing a percentage before the size is known", () => {
  render(<TransferIndicator progress={{ id: "join", phase: "waiting", receivedBytes: 0, totalBytes: null }} />);
  expect(screen.getByText("Loading shared text…")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
  expect(screen.queryByText("0%")).not.toBeInTheDocument();
});

test("clears completed indicators and shows the next incoming transfer", () => {
  jest.useFakeTimers();
  try {
    const { rerender } = render(<TransferIndicator progress={{ ...receiving, phase: "complete" }} />);
    expect(screen.getByText("Text received")).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(2000); });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    rerender(<TransferIndicator progress={{ ...receiving, id: "next" }} />);
    expect(screen.getByText("25%")).toBeInTheDocument();
    rerender(<TransferIndicator progress={null} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});
