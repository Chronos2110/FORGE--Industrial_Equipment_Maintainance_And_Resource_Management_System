const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();

let isConnecting = false;
let memoryServer = null;

/**
 * Connect to MongoDB using Mongoose.
 * Falls back to in-memory MongoDB server if local instance is unavailable.
 */
async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (isConnecting) {
    // Wait until connected
    while (mongoose.connection.readyState !== 1) {
      await new Promise(r => setTimeout(r, 100));
    }
    return mongoose.connection;
  }

  isConnecting = true;

  const primaryUri = process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/forge_industrial';

  try {
    // Try connecting to primary MongoDB (local or Atlas)
    await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 3000
    });
    console.log(`[MongoDB] Connected to database: ${primaryUri}`);
    isConnecting = false;
    return mongoose.connection;
  } catch (primaryErr) {
    console.warn(`[MongoDB] Unable to connect to ${primaryUri}: ${primaryErr.message}`);
    console.log('[MongoDB] Initializing in-memory fallback server (mongodb-memory-server)...');

    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      if (!global.__FORGE_MEMORY_MONGO__) {
        global.__FORGE_MEMORY_MONGO__ = await MongoMemoryServer.create({
          instance: { dbName: 'forge_industrial' }
        });
      }
      memoryServer = global.__FORGE_MEMORY_MONGO__;
      const memUri = memoryServer.getUri();

      await mongoose.connect(memUri);
      console.log(`[MongoDB] Connected to in-memory fallback database: ${memUri}`);
      isConnecting = false;
      return mongoose.connection;
    } catch (memErr) {
      isConnecting = false;
      console.error('[MongoDB] Both primary and in-memory connection attempts failed:', memErr);
      throw memErr;
    }
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
    global.__FORGE_MEMORY_MONGO__ = null;
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  mongoose
};
