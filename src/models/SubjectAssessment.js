import mongoose from 'mongoose';

const SubjectAssessmentSchema = new mongoose.Schema({
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
    behaviorGrade: {
        type: String,
        enum: ['A*', 'A', 'B', 'C', 'D', 'E', 'U'],
        required: true,
        description: 'Cambridge behaviour grade',
    },
    periodTest: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        description: 'Assessment test mark, 0–100',
    },
}, {
    timestamps: true,
    strictPopulate: false,
});

export default mongoose.models.SubjectAssessment ||
    mongoose.model('SubjectAssessment', SubjectAssessmentSchema);
