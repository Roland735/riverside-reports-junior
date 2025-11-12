
// app/api/marks/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import Mark from '@/models/Mark';
import '@/models/Student';  // for populate

export async function GET(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'teacher') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL(req.url);
    const subjectAllocId = url.searchParams.get('subjectAllocId');
    const examPeriodId = url.searchParams.get('examPeriodId');
    if (!subjectAllocId || !examPeriodId) {
        return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }
    await dbConnect();
    const marks = await Mark.find({ subjectAllocId, examPeriodId })
        .populate('studentId', 'name')
        .sort({ 'studentId.name': 1 });
    return NextResponse.json({ marks });
}