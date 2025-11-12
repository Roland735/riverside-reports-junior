import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongoose';
import User from '@/models/User';

export async function POST(request) {
    await dbConnect();

    const { name, email, password } = await request.json();
    if (!name || !email || !password) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const existing = await User.findOne({ email });
    if (existing) {
        return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ name, email, passwordHash, role: 'admin' });
    await user.save();

    return NextResponse.json({ success: true });
}
