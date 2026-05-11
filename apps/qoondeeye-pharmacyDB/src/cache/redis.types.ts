import { createClient } from 'redis';

/** Single alias for the Node `redis` client used by cache + tag index (avoids duplicate generic paths). */
export type SharedRedisClient = ReturnType<typeof createClient>;
