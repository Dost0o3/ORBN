export const API_DOMAIN: string =
  process.env.EXPO_PUBLIC_DOMAIN ?? "nexasid.replit.app";

export const API_BASE: string = `https://${API_DOMAIN}`.replace(/\/$/, "");

export const WEB_DOMAIN: string = API_DOMAIN;

export const WEB_BASE_URL: string = API_BASE;
