import { MongoClient } from 'mongodb';

const uri = 'mongodb://localhost:27017';
const dbName = 'clev';
const collectionName = 'customers';

const client = new MongoClient(uri);
let db, collection;

async function connect() {
  if (!db) {
    await client.connect();
    db = client.db(dbName);
    collection = db.collection(collectionName);
  }
}

async function getCustomers() {
  await connect();
  return collection.find({
    $and: [
      {
        $or: [
          { contacted: { $exists: false } },
          { contacted: { $ne: true } }
        ]
      },
      { country: 'Colombia' }
    ]
  }).toArray();
}

async function markAsContacted(phoneNumber) {
  await connect();
  const fechaColombia = new Date();
  fechaColombia.setHours(fechaColombia.getHours() - 5);

  await collection.updateOne(
    { phoneNumber: phoneNumber },
    { $set: { contacted: true, contactDate: fechaColombia } }
  );
}

async function markAsResponded(phoneNumber) {
  await connect();
  const fechaColombia = new Date();
  fechaColombia.setHours(fechaColombia.getHours() - 5);

  await collection.updateOne(
    { phoneNumber: phoneNumber },
    { $set: { replied: true, responseDate: fechaColombia } }
  );
}

async function closeConnection() {
  await client.close();
}

export default { getCustomers, markAsContacted, closeConnection, markAsResponded };
