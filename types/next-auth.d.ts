// Augment NextAuth session/JWT to carry the Google access token.
// Required for lib/googleSheets.ts "oauth" mode (Sheets calls on behalf of the user).
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    user: DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
  }
}
