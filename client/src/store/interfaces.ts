import { ChatBoxMessages } from "../utils/types";

export interface AppStateProps {
  darkMode: boolean;
  language: string;
}

export interface ChatBoxStateProps {
  isChatOpen: boolean;
  message: string;
  messages: ChatBoxMessages[];
  emitMessage: boolean;
}

export interface JoinRoomProps {
  loggedInUser: string;
  room: string;
  isJoined: boolean;
}
