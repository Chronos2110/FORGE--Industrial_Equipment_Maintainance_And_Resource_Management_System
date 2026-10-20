const dns = require('dns');
// Ensure SRV records resolve smoothly on Windows machines
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connectDB(customUri) {
  if (db) return db;

  const targetUri = customUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/forge';
  client = new MongoClient(targetUri, {
    serverSelectionTimeoutMS: 5000
  });

  await client.connect();
  db = client.db();
  return db;
}

function getDB() {
  return db;
}

async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

// Transparent lazy collection proxy that defers db.collection lookup until runtime methods are called
function getCollection(name) {
  return new Proxy({}, {
    get(target, prop) {
      return function (...args) {
        if (!db) {
          throw new Error(`MongoDB not connected when calling ${name}.${String(prop)}(). Call connectDB() first.`);
        }
        const coll = db.collection(name);
        const member = coll[prop];
        if (typeof member === 'function') {
          return member.apply(coll, args);
        }
        return member;
      };
    }
  });
}

module.exports = {
  connectDB,
  getDB,
  closeDB,
  users: getCollection('users'),
  technicianProfiles: getCollection('technician_profiles'),
  technician_profiles: getCollection('technician_profiles'),
  equipment: getCollection('equipment'),
  inventory: getCollection('inventory_parts'),
  inventory_parts: getCollection('inventory_parts'),
  workOrders: getCollection('work_orders'),
  work_orders: getCollection('work_orders'),
  workOrderParts: getCollection('work_order_parts'),
  work_order_parts: getCollection('work_order_parts'),
  maintenance: getCollection('maintenance_schedules'),
  maintenance_schedules: getCollection('maintenance_schedules'),
  faults: getCollection('fault_reports'),
  fault_reports: getCollection('fault_reports')
};

