import mongoose from 'mongoose';

const StudentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    grade: { type: String, required: true },
    section: { type: String, required: true },
    gender: { type: String, enum: ['Male', 'Female'], required: true },
    slug: { type: String, required: true, unique: true }, // for /student/[slug] URL
}, { timestamps: true });

export default mongoose.models.Student || mongoose.model('Student', StudentSchema);
