import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: {
        type: String,
        enum: ['admin', 'teacher', 'classteacher'],
        required: true,
    },
}, { timestamps: true });

UserSchema.methods.comparePassword = function (password) {
    return bcrypt.compare(password, this.passwordHash);
};

export default mongoose.models.User || mongoose.model('User', UserSchema);
