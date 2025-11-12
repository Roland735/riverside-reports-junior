// app/api/exam-periods/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ExamPeriod from '@/models/ExamPeriod';

export async function GET() {
    await dbConnect();
    const periods = await ExamPeriod.find().sort({ startDate: -1 });
    return NextResponse.json({ periods });
}

export async function POST(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'admin')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name, term, startDate, endDate, totalDays, active } = await req.json();
    if (!name || !term || !startDate || !endDate || totalDays == null)
        return NextResponse.json({ error: 'All fields are required' }, { status: 400 });

    await dbConnect();

    // if user wants this new period active, deactivate others
    if (active) {
        await ExamPeriod.updateMany({}, { active: false });
    }

    const created = await ExamPeriod.create({
        name: name.trim(),
        term: term.trim(),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalDays: Number(totalDays),
        active: Boolean(active),
    });

    return NextResponse.json({ message: 'Created', period: created });
}
