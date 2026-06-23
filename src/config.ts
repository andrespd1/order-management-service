// Runtime config, read from the environment in one place.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
} as const;
