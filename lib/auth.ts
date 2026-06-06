/**
 * NextAuth v4 configuration.
 *
 *   - Google OAuth with email allowlist (anyone in ALLOWED_EMAILS OR with
 *     @ALLOWED_EMAIL_DOMAIN).
 *   - Requests the `spreadsheets` scope so that — once a Sheet ID is configured —
 *     the user's own Google account can read/write the spreadsheet on their
 *     behalf, without a service-account key (lib/googleSheets.ts "oauth" mode).
 *   - Stores the OAuth access_token on the JWT and exposes it via session.
 *
 * Required env vars: see .env.local.example
 */
import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

function parseList(s: string | undefined): string[] {
  return (s ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN ?? "").trim().toLowerCase();
  const list = parseList(process.env.ALLOWED_EMAILS);
  if (list.includes(e)) return true;
  if (domain && e.endsWith(`@${domain}`)) return true;
  // Dev fallback: if neither var is set, allow any email so the app is usable
  // before OAuth is configured for production.
  if (!domain && list.length === 0) return true;
  return false;
}

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          // Request profile + Sheets access. `offline` + `consent` are required
          // to receive a refresh_token on first login.
          scope: `openid email profile ${SHEETS_SCOPE}`,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user }) {
      if (!isEmailAllowed(user.email)) return "/denied";
      return true;
    },
    async jwt({ token, account }) {
      // On the very first sign-in, account is present and carries the tokens.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email as string;
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.image = (token.picture as string) ?? session.user.image;
      }
      // Expose the access token so server code (lib/googleSheets.ts) can call
      // the Sheets API on behalf of this user.
      (session as { accessToken?: string }).accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
};
