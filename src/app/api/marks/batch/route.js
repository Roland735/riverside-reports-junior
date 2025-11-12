// app/api/marks/batch/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import Mark from '@/models/Mark';

export async function POST(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'teacher') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { examPeriodId, subjectAllocId, totalMarks, rows } = await req.json();
    if (!examPeriodId || !subjectAllocId || !totalMarks || !Array.isArray(rows)) {
        return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
    }

    await dbConnect();

    const ops = rows.map(r => {
        const markVal = Number(r.mark);
        const pct = totalMarks > 0
            ? Math.round((markVal / Number(totalMarks)) * 1000) / 10
            : 0;

        return {
            updateOne: {
                filter: {
                    studentId: r.studentId,
                    subjectAllocId,
                    examPeriodId,
                    paper: String(r.paper ?? ''),
                },
                update: {
                    $set: {
                        mark: markVal,
                        totalMarks: Number(totalMarks),
                        percentage: pct,
                    }
                },
                upsert: true
            }
        };
    });

    await Mark.bulkWrite(ops);

    return NextResponse.json({ message: 'Marks saved' });
}

export async function DELETE(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'teacher') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { examPeriodId, subjectAllocId, paper } = await req.json();
    if (!examPeriodId || !subjectAllocId || !paper) {
        return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
    }

    await dbConnect();

    // remove all marks for this allocation + period + paper
    await Mark.deleteMany({
        subjectAllocId,
        examPeriodId,
        paper: String(paper)
    });

    return NextResponse.json({ message: 'All marks deleted' });
}
