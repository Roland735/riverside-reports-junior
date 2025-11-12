// app/api/subjects/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import Subject from '@/models/Subject';

export async function POST(req) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { name } = await req.json();

    if (!name || name.trim() === '') {
        return NextResponse.json({ error: 'Subject name is required' }, { status: 400 });
    }

    try {
        const newSubject = await Subject.create({ name: name.trim() });
        return NextResponse.json({ message: 'Subject created', subject: newSubject });
    } catch (err) {
        if (err.code === 11000) {
            return NextResponse.json({ error: 'Subject already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Error creating subject' }, { status: 500 });
    }
}

export async function GET() {
    await dbConnect();
    const subjects = await Subject.find().sort({ name: 1 });
    return NextResponse.json({ subjects });
}
