import mongoose from 'mongoose';
const { Schema } = mongoose;

const CAMBRIDGE_GRADES = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'];

const CambridgeCharacteristicSchema = new Schema({
    studentId: {
        type: Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
    },


    // the four characteristics, each must be one of the Cambridge grades
    punctuality: { type: String, enum: CAMBRIDGE_GRADES, required: true },
    behaviour: { type: String, enum: CAMBRIDGE_GRADES, required: true },
    dressing: { type: String, enum: CAMBRIDGE_GRADES, required: true },
    attendance: { type: String, enum: CAMBRIDGE_GRADES, required: true },

}, {
    timestamps: true,
});

// Prevent duplicate grade records for same student + year + session
CambridgeCharacteristicSchema.index(
    { studentId: 1, academicYear: 1, session: 1 },
    { unique: true, sparse: false }
);

export default mongoose.models.CambridgeCharacteristic ||
    mongoose.model('CambridgeCharacteristic', CambridgeCharacteristicSchema);
