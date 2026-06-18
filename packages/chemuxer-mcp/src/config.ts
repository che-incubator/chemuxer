import * as z from 'zod/v4';

const ConfigSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  host: z.string().min(1).default('0.0.0.0'),
  namespace: z.string().optional(),
  chemuxerDefaultPort: z.coerce.number().int().min(1).max(65535).default(7681),
  requestTimeoutMs: z.coerce.number().int().min(0).default(2000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Readonly<Config> {
  const result = ConfigSchema.parse({
    port: process.env.PORT,
    host: process.env.HOST,
    namespace: process.env.NAMESPACE,
    chemuxerDefaultPort: process.env.CHEMUXER_DEFAULT_PORT,
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS,
  });

  return Object.freeze(result);
}
