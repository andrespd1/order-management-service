// Runtime config, read from the environment in one place.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  // CORS allowlist: comma-separated origins, or any origin when unset (fine for a demo;
  // pin to the known frontend origins in production).
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
    : true,
} as const;
