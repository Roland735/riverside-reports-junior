import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import SubjectAllocation from '@/models/SubjectAllocation';
import Student from '@/models/Student';
import Mark from '@/models/Mark';
import Comment from '@/models/Comment';
import SubjectAssessment from '@/models/SubjectAssessment';

export async function GET(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'teacher')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const allocationIds = searchParams.get('allocationIds');
    const examPeriodId = searchParams.get('examPeriodId');
    if (!allocationIds || !examPeriodId)
        return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    await dbConnect();
    const allocIds = allocationIds.split(',');

    const allocations = await SubjectAllocation.find({
        _id: { $in: allocIds }
    }).populate('classId');

    if (!allocations.length)
        return NextResponse.json({ error: 'No allocations found' }, { status: 404 });

    const firstClass = allocations[0].classId;
    if (!allocations.every(a =>
        a.classId.grade === firstClass.grade &&
        a.classId.section === firstClass.section
    )) {
        return NextResponse.json({ error: 'Allocations must be for same class' }, { status: 400 });
    }

    const students = await Student.find({
        grade: firstClass.grade,
        section: firstClass.section
    }).sort('name');

    const rows = await Promise.all(students.map(async student => {
        const marks = await Mark.find({
            studentId: student._id,
            subjectAllocId: { $in: allocIds },
            examPeriodId
        });
        const marksByPaper = {};
        marks.forEach(m => marksByPaper[m.paper] = m.percentage);

        const scores = marks.map(m => m.percentage);
        const avg = scores.length
            ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
            : '';
        const sd = scores.length
            ? Math.sqrt(scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / scores.length).toFixed(1)
            : '';

        const assess = await SubjectAssessment.findOne({
            studentId: student._id,
            subjectAllocId: { $in: allocIds },
            examPeriodId
        });

        const commentDoc = await Comment.findOne({
            studentId: student._id,
            subjectAllocId: { $in: allocIds },
            type: 'subject'
        });

        const row = {
            studentId: student._id.toString(),
            name: student.name,
            average: avg,
            stddev: sd,
            periodTest: assess?.periodTest ?? '',
            behaviorGrade: assess?.behaviorGrade ?? '',
            comment: commentDoc?.text || ''
        };

        allocations.forEach(a => {
            row[`Paper${a.paper}`] = marksByPaper[a.paper] || '';
        });

        return row;
    }));

    return NextResponse.json({
        groupInfo: {
            subject: allocations[0].subject,
            grade: firstClass.grade,
            section: firstClass.section,
            papers: allocations.map(a => ({
                paper: a.paper,
                allocationId: a._id.toString()
            }))
        },
        rows
    });
}
