// models/SubjectAllocation.js
import mongoose from 'mongoose';

const SubjectAllocationSchema = new mongoose.Schema({
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true,
    },
    subject: { type: String, required: true },
    paper: { type: Number, required: true },     // now a number: e.g. 1, 2
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {
    timestamps: true,
    // ensure populate keys are known
    strictPopulate: false
});

export default mongoose.models.SubjectAllocation ||
    mongoose.model('SubjectAllocation', SubjectAllocationSchema);
