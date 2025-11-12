import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
    },
    subjectAllocId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubjectAllocation',
    },
    type: {
        type: String,
        enum: ['subject', 'classteacher', 'admin'],
        required: true,
    },
    text: { type: String, required: true },
}, { timestamps: true });

export default mongoose.models.Comment || mongoose.model('Comment', CommentSchema);
