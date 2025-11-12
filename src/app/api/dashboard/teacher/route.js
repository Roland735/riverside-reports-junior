// app/api/dashboard/teacher/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';

// **Import these to register their schemas**
import SubjectAllocation from '@/models/SubjectAllocation';
import '@/models/Class';           // <— ensure Class is registered
import '@/models/Student';         // if you ever populate student
import '@/models/ExamPeriod';      // if you ever populate period

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'teacher') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    // Now SubjectAllocation.populate('classId') will work
    const allocations = await SubjectAllocation.find({
        teacherId: session.user.id
    })
        .populate('classId', 'grade section')
        .sort({ subject: 1, paper: 1 });

    return NextResponse.json({ allocations });
}
