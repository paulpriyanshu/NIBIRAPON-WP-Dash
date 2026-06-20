import { MongoClient } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// Lazy — only throws when a route handler actually calls getMongoClient(),
// not at module-evaluation time (which would crash the Next.js build when
// MONGODB_URI is absent from Vercel env vars).
//
// The client promise is memoised on `global` in EVERY environment (not just
// dev). On Vercel the lambda container is reused across invocations, so caching
// turns a fresh TCP+TLS+auth handshake on every getMongoClient() call (~200-500ms
// each, and the agent path opens 4 per message) into a one-time cost per warm
// container. The MongoDB driver pools connections internally behind this promise.
function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI env var is not set. Add it in Vercel → Settings → Environment Variables.');

  if (!global._mongoClientPromise) {
    global._mongoClientPromise = new MongoClient(uri).connect().catch((err) => {
      // Don't cache a rejected promise — clear it so the next call retries
      // a fresh connection instead of being stuck with the failed one.
      global._mongoClientPromise = undefined;
      throw err;
    });
  }
  return global._mongoClientPromise;
}

export default getMongoClient;
