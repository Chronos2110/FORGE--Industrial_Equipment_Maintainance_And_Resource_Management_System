require('dotenv').config();
const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (e) {}
const { MongoClient } = require('mongodb');

async function checkConnection() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/forge';
  console.log(`Checking MongoDB connection to: ${uri.replace(/\/\/[^@]+@/, '//***:***@')}`);

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
  try {
    await client.connect();
    const db = client.db();
    const collections = await db.listCollections().toArray();
    console.log(`✅ MongoDB Connected Successfully!`);
    console.log(`   Database name: ${db.databaseName}`);
    console.log(`   Existing collections (${collections.length}):`, collections.map(c => c.name).join(', ') || 'None (run npm run seed)');
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error(`❌ MongoDB Connection Failed:`, err.message);
    console.log('\n--- Setup Instructions ---');
    console.log('1. If using MongoDB Atlas:');
    console.log('   In .env, set:');
    console.log('   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/forge?retryWrites=true&w=majority\n');
    console.log('2. If using Docker:');
    console.log('   docker run -d -p 27017:27017 --name forge-mongo mongo:latest\n');
    console.log('3. If using local MongoDB Community Server on Windows:');
    console.log('   Ensure MongoDB service is started in Windows Services (services.msc) or run mongod.exe');
    process.exit(1);
  }
}

checkConnection();
