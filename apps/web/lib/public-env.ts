// Values safe for the browser. APP_URL is exposed to the client through next.config.mjs.
export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
};
