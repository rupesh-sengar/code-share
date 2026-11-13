import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { afterEach, beforeEach, vi } from "vitest";
import App from "./App";
import store, { toggleJoinRoom, updateLoggedInUser, updateRoom } from "./store/store";

vi.mock("./utils/socket", () => ({
  default: {
    connected: false, on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn(),
    io: { on: vi.fn(), off: vi.fn() },
  },
}));
vi.mock("./components/text-area/text-area", () => ({
  default: ({ room, currentUser }: { room: string; currentUser: string }) => (
    <div>Editing room {room} as {currentUser}</div>
  ),
}));

function resetSession() {
  store.dispatch(toggleJoinRoom(false));
  store.dispatch(updateLoggedInUser(""));
  store.dispatch(updateRoom(""));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  resetSession();
});
afterEach(() => window.history.replaceState(null, "", "/"));

test("renders the app and joins a room using the room selector", async () => {
  const user = userEvent.setup();
  render(<Provider store={store}><App /></Provider>);
  expect(screen.getByText("Code Share")).toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Your name" }), "Alice & Bob");
  await user.type(screen.getByRole("textbox", { name: "Room name" }), "team/room+1");
  await user.click(screen.getByRole("button", { name: "Join Room" }));
  expect(await screen.findByText("Editing room team/room+1 as Alice & Bob")).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get("name")).toBe("Alice & Bob");
  expect(new URLSearchParams(window.location.search).get("room")).toBe("team/room+1");
});

test("restores the same room and name after the app starts again", async () => {
  window.history.replaceState(null, "", "/?name=Alice+%26+Bob&room=team%2Fone");
  const first = render(<Provider store={store}><App /></Provider>);
  expect(await screen.findByText("Editing room team/one as Alice & Bob")).toBeInTheDocument();
  first.unmount();
  resetSession();
  render(<Provider store={store}><App /></Provider>);
  expect(await screen.findByText("Editing room team/one as Alice & Bob")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "Your name" })).not.toBeInTheDocument());
});

test.each([
  "?room=team-room", "?name=Alice", "?name=A&room=team-room", "?name=Alice&room=ab",
])("keeps the join selector for invalid or incomplete parameters: %s", (query) => {
  window.history.replaceState(null, "", "/" + query);
  render(<Provider store={store}><App /></Provider>);
  expect(screen.getByRole("textbox", { name: "Your name" })).toBeInTheDocument();
  expect(store.getState().joinRoom.isJoined).toBe(false);
});

test("exiting clears the room URL without removing other parameters or the hash", async () => {
  window.history.replaceState(null, "", "/?view=code&name=Alice&room=team-room#editor");
  const user = userEvent.setup();
  render(<Provider store={store}><App /></Provider>);
  expect(await screen.findByText("Editing room team-room as Alice")).toBeInTheDocument();
  await user.click(screen.getByAltText("Exit"));
  expect(await screen.findByRole("textbox", { name: "Your name" })).toBeInTheDocument();
  expect(window.location.search).toBe("?view=code");
  expect(window.location.hash).toBe("#editor");
});

test("follows room changes and leaving through browser navigation", async () => {
  window.history.replaceState(null, "", "/?name=Alice&room=first-room");
  render(<Provider store={store}><App /></Provider>);
  expect(await screen.findByText("Editing room first-room as Alice")).toBeInTheDocument();
  act(() => {
    window.history.replaceState(null, "", "/?name=Bob&room=second-room");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(await screen.findByText("Editing room second-room as Bob")).toBeInTheDocument();
  act(() => {
    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitFor(() => expect(store.getState().joinRoom.isJoined).toBe(false));
  expect(await screen.findByRole("textbox", { name: "Your name" })).toBeInTheDocument();
});
