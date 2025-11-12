

// app/api/marks/template/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import SubjectAllocation from '@/models/SubjectAllocation';
import Student from '@/models/Student';

export async function GET(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'teacher')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const allocId = url.searchParams.get('allocId');
    const examPeriodId = url.searchParams.get('examPeriodId');
    if (!allocId || !examPeriodId)
        return NextResponse.json({ error: 'allocId & examPeriodId required' }, { status: 400 });

    await dbConnect();
    const alloc = await SubjectAllocation.findById(allocId).populate('classId');
    if (!alloc) return NextResponse.json({ error: 'Allocation not found' }, { status: 404 });

    // fetch all students in this class
    const { grade, section } = alloc.classId;
    const students = await Student.find({ grade, section }).select('name _id');

    // build template rows
    const rows = students.map(s => ({
        studentId: s._id.toString(),
        name: s.name,
        mark: ''
    }));

    return NextResponse.json({
        allocation: {
            _id: alloc._id,
            subject: alloc.subject,
            paper: alloc.paper,
        },
        examPeriodId,
        rows
    });
}