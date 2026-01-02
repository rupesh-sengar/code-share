import { createSlice, configureStore } from "@reduxjs/toolkit";
import {
  chatBoxInitialState,
  initialAppState,
  joinRoomInitialState,
} from "./initial-states";

const appSlice = createSlice({
  name: "appSlice",
  initialState: initialAppState,
  reducers: {
    updateLanguage: (state, action) => {
      state.language = action.payload;
    },
    toggleDarkMode: (state) => {
      state.darkMode = !state.darkMode;
    },
  },
});
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

const joinRoomSlice = createSlice({
  name: "joinRoomSlice",
  initialState: joinRoomInitialState,
  reducers: {
    toggleJoinRoom: (state, action) => {
      state.isJoined = action.payload;
    },
    updateLoggedInUser: (state, action) => {
      state.loggedInUser = action.payload;
    },
    updateRoom: (state, action) => {
      state.room = action.payload;
    },
  },
});

export const { updateLanguage, toggleDarkMode } = appSlice.actions;
export const {
  toggleChatOpen,
  updateChatMessages,
  updateMessage,
  updateEmitMessage,
} = chatBoxSlice.actions;

export const { toggleJoinRoom, updateLoggedInUser, updateRoom } =
  joinRoomSlice.actions;

const store = configureStore({
  reducer: {
    appSlice: appSlice.reducer,
    chatBox: chatBoxSlice.reducer,
    joinRoom: joinRoomSlice.reducer,
  },
});

export type AppStore = typeof store;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
export default store;
