// models/Subject.js
import mongoose from 'mongoose';

const SubjectSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
}, { timestamps: true });

export default mongoose.models.Subject || mongoose.model('Subject', SubjectSchema);
