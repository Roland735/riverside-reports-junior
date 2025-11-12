import mongoose from 'mongoose';

const MarkSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
    },
    subjectAllocId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubjectAllocation',
        required: true,
    },
    examPeriodId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExamPeriod',
        required: true,
    },
    paper: { type: String, required: true }, // e.g. "Paper 2"
    mark: { type: Number, required: true },
    totalMarks: { type: Number, required: true },  // new: maximum for this paper
    percentage: { type: Number, required: true },  // new: mark/totalMarks*100
    behaviorGrade: { type: String }, // optional: A, B, C etc.
    periodTest: { type: Number }, // optional
}, { timestamps: true });

export default mongoose.models.Mark || mongoose.model('Mark', MarkSchema);
