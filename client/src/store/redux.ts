import { createSlice, configureStore } from "@reduxjs/toolkit";
import { ChatBoxMessages } from "../utils/types";

interface ChatBoxStateProps {
  isChatOpen: boolean;
  message: string;
  messages: ChatBoxMessages[];
  emitMessage: boolean;
}

const chatBoxInitialState: ChatBoxStateProps = {
  isChatOpen: false,
  message: "",
  messages: [],
  emitMessage: false,
};

const chatBoxSlice = createSlice({
  name: "chatBoxSlice",
  initialState: chatBoxInitialState,
  reducers: {
    toggleChatOpen: (state) => {
      state.isChatOpen = !state.isChatOpen;
    },
    updateChatMessages: (state, action) => {
      state.messages.push(action.payload);
    },
    updateMessage: (state, action) => {
      state.message = action.payload;
    },
    updateEmitMessage: (state, action) => {
      state.emitMessage = action.payload;
    },
  },
});

export const {
  toggleChatOpen,
  updateChatMessages,
  updateMessage,
  updateEmitMessage,
} = chatBoxSlice.actions;

const store = configureStore({
  reducer: {
    chatBox: chatBoxSlice.reducer,
  },
});

export default store;
