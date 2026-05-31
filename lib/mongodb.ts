import { MongoClient } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// Lazy — only throws when a route handler actually calls getMongoClient(),
// not at module-evaluation time (which would crash the Next.js build when
// MONGODB_URI is absent from Vercel env vars).
function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI env var is not set. Add it in Vercel → Settings → Environment Variables.');

  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(uri).connect();
    }
    return global._mongoClientPromise;
  }

  return new MongoClient(uri).connect();
}

export default getMongoClient;
