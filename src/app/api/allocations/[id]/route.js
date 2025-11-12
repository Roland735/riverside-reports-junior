// app/api/allocations/[id]/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import SubjectAllocation from '@/models/SubjectAllocation';

export async function PATCH(req, { params }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();
    const { subject, paper, teacherId } = await req.json();
    if (!subject || paper == null || !teacherId) {
        return NextResponse.json(
            { error: 'subject, paper & teacherId are required' },
            { status: 400 }
        );
    }
    const updated = await SubjectAllocation.findByIdAndUpdate(
        params.id,
        { subject, paper: Number(paper), teacherId },
        { new: true }
    );
    if (!updated) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Allocation updated', allocation: updated });
}

export async function DELETE(req, { params }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();
    const deleted = await SubjectAllocation.findByIdAndDelete(params.id);
    if (!deleted) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Allocation deleted' });
}
