import { config } from "dotenv";
config({ path: ".env" });

export const { CLIENT_URL } = process.env;
