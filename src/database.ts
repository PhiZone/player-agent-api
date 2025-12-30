import { MongoClient, ObjectId, type Document } from 'mongodb';
import config from '../config.json' with { type: 'json' };
import type { Query, Run, RunCreate } from './schemas.js';
import { hrid } from './hrid.js';

class Database {
  private client: MongoClient;
  private uri: string;
  private dbName: string;

  constructor() {
    this.uri = config.mongoDbUri;
    this.dbName = config.mongoDbName;
    this.client = new MongoClient(this.uri);
    console.log('[MongoDB] Initialized.');
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    console.log('[MongoDB] Disconnected.');
  }

  private collection<T extends Document>(name: string) {
    return this.client.db(this.dbName).collection<T & { _id?: ObjectId }>(name);
  }

  async countRuns() {
    const runsCollection = this.collection<Run>('runs');
    return await runsCollection.countDocuments();
  }

  async countUsers() {
    const runsCollection = this.collection<Run>('runs');
    return await runsCollection.distinct('user').then((users) => users.length);
  }

  async getRuns(query: Query, prefix: string) {
    const runsCollection = this.collection<Run>('runs');
    return {
      total: await runsCollection.countDocuments({
        user: `${prefix}/${query.user}`
      }),
      runs: await runsCollection
        .find({
          user: `${prefix}/${query.user}`
        })
        .sort({ dateCreated: -1 })
        .skip(query.page ? (query.page - 1) * query.limit : 0)
        .limit(query.limit || 20)
        .toArray()
    };
  }

  async getRun(id: string | ObjectId, user?: string, prefix?: string) {
    const runsCollection = this.collection<Run>('runs');
    try {
      if (typeof id === 'string') {
        id = new ObjectId(id);
      }
    } catch {
      // Ignore parse errors
    }
    return await runsCollection
      .find(typeof id === 'string' ? { id, user: `${prefix}/${user}` } : { _id: id })
      .sort({ dateCreated: -1 })
      .limit(1)
      .next();
  }

  async getCurrentRun(user: string, prefix: string) {
    const runsCollection = this.collection<Run>('runs');
    return await runsCollection.findOne({
      user: `${prefix}/${user}`,
      dateCompleted: { $exists: false }
    });
  }

  async createRun(run: RunCreate, client: { name: string; prefix: string }) {
    const runsCollection = this.collection<Run>('runs');
    const runId = hrid(client.name);
    const result = await runsCollection.insertOne({
      id: runId,
      user: `${client.prefix}/${run.user}`,
      input: run.input,
      mediaOptions: run.mediaOptions,
      preferences: run.preferences,
      toggles: run.toggles,
      outputFiles: [],
      status: 'queued',
      dateCreated: new Date()
    });
    return {
      objectId: result.insertedId,
      runId
    };
  }

  async updateRun(run: Run & { _id?: ObjectId }) {
    const runsCollection = this.collection<Run>('runs');
    await runsCollection.updateOne({ _id: run._id }, { $set: run });
  }
}

const db = new Database();
export default db;
