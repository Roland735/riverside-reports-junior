import mongoose from 'mongoose';

const ExamPeriodSchema = new mongoose.Schema({
    name: { type: String, required: true }, // e.g. "End Term 1"
    term: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalDays: { type: Number, required: true },
    active: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.models.ExamPeriod || mongoose.model('ExamPeriod', ExamPeriodSchema);
