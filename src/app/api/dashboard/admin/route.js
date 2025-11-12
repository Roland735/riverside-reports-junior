// app/api/dashboard/admin/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import User from '@/models/User';
import Student from '@/models/Student';
import ExamPeriod from '@/models/ExamPeriod';
import SubjectAllocation from '@/models/SubjectAllocation';

export async function GET(request) {
    // ensure only admin
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const teacherCount = await User.countDocuments({ role: 'teacher' });
    const studentCount = await Student.countDocuments();
    const periodCount = await ExamPeriod.countDocuments();
    const allocationCount = await SubjectAllocation.countDocuments();

    return NextResponse.json({
        teacherCount,
        studentCount,
        periodCount,
        allocationCount,
    });
}
