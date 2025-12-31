import { AppStateProps, ChatBoxStateProps, JoinRoomProps } from "./interfaces";

export const initialAppState: AppStateProps = {
  darkMode: false,
  language: "javascript",
};

export const chatBoxInitialState: ChatBoxStateProps = {
  isChatOpen: false,
  message: "",
  messages: [],
  emitMessage: false,
};

export const joinRoomInitialState: JoinRoomProps = {
  loggedInUser: "",
  room: "",
  isJoined: false,
};
