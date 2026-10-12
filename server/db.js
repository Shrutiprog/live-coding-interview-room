// Data layer. Uses MongoDB (Mongoose) when available, otherwise an in-memory
// fallback so the project still runs on a machine without MongoDB installed.
import mongoose from 'mongoose';
import dns from 'node:dns';
if (!process.env.RENDER) dns.setServers(['8.8.8.8', '1.1.1.1']);

const roomSchema = new mongoose.Schema({
  roomId: { type: String, unique: true, index: true },
  hostToken: String,
  title: String,
  meetLink: String,
  language: { type: String, default: 'javascript' },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
});

const feedbackSchema = new mongoose.Schema({
  roomId: { type: String, index: true },
  candidateName: String,
  interviewerName: String,
  ratings: {
    problemSolving: Number,
    codeQuality: Number,
    communication: Number,
    technical: Number,
  },
  recommendation: { type: String, enum: ['strong_hire', 'hire', 'no_hire', 'strong_no_hire'] },
  comments: String,
  finalCode: String,
  language: String,
  submittedAt: { type: Date, default: Date.now },
});

const Room = mongoose.models.Room || mongoose.model('Room', roomSchema);
const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);

let useMongo = false;
const memRooms = new Map();
const memFeedback = [];

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri || process.env.USE_MEMORY_DB === 'true') {
    console.warn('[db] Using IN-MEMORY storage (data is lost on restart). Set MONGODB_URI to use MongoDB.');
    return 'memory';
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    useMongo = true;
    console.log('[db] Connected to MongoDB');
    return 'mongodb';
  } catch (err) {
    console.warn('[db] MongoDB connection failed (' + err.message + '). Falling back to IN-MEMORY storage.');
    return 'memory';
  }
}

const clean = (doc) => {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o._id; delete o.__v;
  return o;
};

export async function createRoom(data) {
  if (!useMongo) { const r = { ...data, status: 'active', createdAt: new Date() }; memRooms.set(r.roomId, r); return clean(r); }
  return clean(await Room.create(data));
}
export async function getRoom(roomId) {
  if (!useMongo) return clean(memRooms.get(roomId));
  return clean(await Room.findOne({ roomId }));
}
export async function updateRoom(roomId, patch) {
  if (!useMongo) { const r = memRooms.get(roomId); if (r) Object.assign(r, patch); return clean(r); }
  return clean(await Room.findOneAndUpdate({ roomId }, patch, { new: true }));
}
export async function saveFeedback(data) {
  if (!useMongo) { const f = { ...data, submittedAt: new Date() }; memFeedback.push(f); return clean(f); }
  return clean(await Feedback.create(data));
}
export async function getFeedback(roomId) {
  if (!useMongo) return memFeedback.filter((f) => f.roomId === roomId).map(clean);
  return (await Feedback.find({ roomId }).sort({ submittedAt: -1 })).map(clean);
}
