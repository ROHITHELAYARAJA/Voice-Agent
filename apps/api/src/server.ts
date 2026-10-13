import { configuration } from "./config.ts";
import { buildApi } from "./app.ts";
const env = configuration();
const app = await buildApi(env);
await app.listen({ host: "0.0.0.0", port: env.PORT });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => void app.close());
