// app/api/allocations/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import SubjectAllocation from '@/models/SubjectAllocation';

export async function GET() {
    await dbConnect();

    // fetch all, then populate both refs
    const allocations = await SubjectAllocation.find()
        .populate('classId', 'grade section')
        .populate('teacherId', 'name');

    return NextResponse.json({ allocations });
}

export async function POST(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { classId, subject, paper, teacherId } = await req.json();

    // validation
    if (!classId || !subject || paper == null || !teacherId) {
        return NextResponse.json(
            { error: 'classId, subject, paper & teacherId are all required' },
            { status: 400 }
        );
    }

    // create with numeric paper
    const allocation = await SubjectAllocation.create({
        classId,
        subject: subject.trim(),
        paper: Number(paper),
        teacherId,
    });

    return NextResponse.json({ message: 'Allocation created', allocation });
}
