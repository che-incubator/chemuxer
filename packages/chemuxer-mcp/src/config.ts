import * as z from 'zod/v4';

const TransportSchema = z.enum(['stdio', 'http']);

const ConfigSchema = z.object({
  transport: TransportSchema.default('stdio'),
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  host: z.string().min(1).default('0.0.0.0'),
  namespace: z.string().optional(),
  chemuxerDefaultPort: z.coerce.number().int().min(1).max(65535).default(7681),
  requestTimeoutMs: z.coerce.number().int().min(0).default(2000),
  authEnabled: z.preprocess(
    (v) => typeof v === 'string' ? v.toLowerCase() === 'true' : v,
    z.boolean().default(false),
  ),
});

export type Config = z.infer<typeof ConfigSchema>;

function getArgValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) return undefined;
  return argv[index + 1];
}

export function loadConfig(argv: string[] = []): Readonly<Config> {
  const result = ConfigSchema.parse({
    transport: getArgValue(argv, '--transport') ?? process.env.CHEMUXER_MCP_TRANSPORT,
    port: getArgValue(argv, '--port') ?? process.env.PORT,
    host: process.env.HOST,
    namespace: getArgValue(argv, '--namespace') ?? process.env.NAMESPACE,
    chemuxerDefaultPort: process.env.CHEMUXER_DEFAULT_PORT,
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS,
    authEnabled: process.env.CHEMUXER_MCP_AUTH_ENABLED,
  });

  return Object.freeze(result);
}
