// app/api/classes/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import Class from '@/models/Class';

export async function GET() {
    await dbConnect();
    const classes = await Class.find().populate('classTeacherId', 'name');
    return NextResponse.json({ classes });
}

export async function POST(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();

    const { classId, classTeacherId } = await req.json();
    if (!classId || !classTeacherId) {
        return NextResponse.json({ error: 'classId & classTeacherId required' }, { status: 400 });
    }

    const cls = await Class.findByIdAndUpdate(
        classId,
        { classTeacherId },
        { new: true }
    );
    return NextResponse.json({ message: 'Class updated', class: cls });
}
