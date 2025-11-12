import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import Comment from '@/models/Comment';
import SubjectAssessment from '@/models/SubjectAssessment';

export async function POST(req) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'teacher') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { allocationIds, rows, examPeriodId } = await req.json();
        if (!Array.isArray(allocationIds) || !allocationIds.length ||
            !Array.isArray(rows) || !examPeriodId) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        await dbConnect();
        const commentOps = [];
        const assessmentOps = [];

        rows.forEach(row => {
            if (!row.studentId) return;
            allocationIds.forEach(allocId => {
                // upsert comment
                if (row.comment?.trim()) {
                    commentOps.push({
                        updateOne: {
                            filter: {
                                studentId: row.studentId,
                                subjectAllocId: allocId,
                                type: 'subject'
                            },
                            update: { $set: { text: row.comment } },
                            upsert: true
                        }
                    });
                }
                // upsert assessment only if letter + numeric test exist
                if (
                    ['A*', 'A', 'B', 'C', 'D', 'E', 'U'].includes(row.behaviorGrade) &&
                    typeof row.periodTest === 'number'
                ) {
                    assessmentOps.push({
                        updateOne: {
                            filter: {
                                studentId: row.studentId,
                                subjectAllocId: allocId,
                                examPeriodId
                            },
                            update: {
                                $set: {
                                    behaviorGrade: row.behaviorGrade,
                                    periodTest: row.periodTest
                                }
                            },
                            upsert: true
                        }
                    });
                }
            });
        });

        if (commentOps.length) await Comment.bulkWrite(commentOps);
        if (assessmentOps.length) await SubjectAssessment.bulkWrite(assessmentOps);

        return NextResponse.json({
            message: 'Saved comments & assessments',
            commentsWritten: commentOps.length,
            assessmentsWritten: assessmentOps.length
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json(
            { error: 'Save failed', details: err.message },
            { status: 500 }
        );
    }
}
