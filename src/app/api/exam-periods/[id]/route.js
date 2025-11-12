// app/api/exam-periods/[id]/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ExamPeriod from '@/models/ExamPeriod';

export async function PATCH(req, { params }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'admin')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name, term, startDate, endDate, totalDays, active } = await req.json();
    if (!name || !term || !startDate || !endDate || totalDays == null)
        return NextResponse.json({ error: 'All fields are required' }, { status: 400 });

    await dbConnect();

    // if activating this one, deactivate all others first
    if (active) {
        await ExamPeriod.updateMany({ _id: { $ne: params.id } }, { active: false });
    }

    const updated = await ExamPeriod.findByIdAndUpdate(
        params.id,
        {
            name: name.trim(),
            term: term.trim(),
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            totalDays: Number(totalDays),
            active: Boolean(active),
        },
        { new: true }
    );
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ message: 'Updated', period: updated });
}

export async function DELETE(req, { params }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'admin')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbConnect();
    const deleted = await ExamPeriod.findByIdAndDelete(params.id);
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ message: 'Deleted' });
}
