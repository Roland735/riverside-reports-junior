
// app/api/marks/[id]/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import Mark from '@/models/Mark';

export async function DELETE(req, { params }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'teacher') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();
    const deleted = await Mark.findByIdAndDelete(params.id);
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ message: 'Deleted' });
}

