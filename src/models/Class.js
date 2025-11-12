// models/Class.js
import mongoose from 'mongoose';

const ClassSchema = new mongoose.Schema({
    grade: { type: String, required: true },
    section: { type: String, required: true },
    classTeacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, { timestamps: true });

// enforce one Class per grade+section
ClassSchema.index({ grade: 1, section: 1 }, { unique: true });

export default mongoose.models.Class || mongoose.model('Class', ClassSchema);
