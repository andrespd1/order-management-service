/**
 * Centralized runtime configuration, read once from the environment.
 * Keeping this in one place means the rest of the code never touches process.env.
 */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
} as const;
