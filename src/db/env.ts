import { createServerFn } from "@tanstack/react-start";

export const getCreds = createServerFn()
  .handler(async () => {
    return {
      url: process.env.TEAM_DB_URL?.substring(0, 10) + "...",
      hasToken: !!process.env.TEAM_DB_AUTH_TOKEN,
      hasJwt: !!process.env.JWT_SECRET,
    };
  });