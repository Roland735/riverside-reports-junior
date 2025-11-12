// src/app/api/reports/class-batch/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import Student from "@/models/Student";
import ExamPeriod from "@/models/ExamPeriod";
import Subject from "@/models/Subject";
import SubjectAssessment from "@/models/SubjectAssessment";
import Mark from "@/models/Mark";
import Comment from "@/models/Comment";
import Attendance from "@/models/Attendance";
import ClassModel from "@/models/Class";

function groupBy(arr, keyFn) {
    return arr.reduce((acc, item) => {
        const key = keyFn(item);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
}

export async function POST(req) {
    await dbConnect();

    try {
        const { classIds, examPeriodId } = await req.json();

        const examPeriod = await ExamPeriod.findById(examPeriodId);
        if (!examPeriod) return NextResponse.json({ error: "Invalid exam period" }, { status: 400 });

        // Preload all data
        const students = await Student.find({ class: { $in: classIds } }).lean();
        const studentIds = students.map(s => s._id);

        const marks = await Mark.find({ examPeriodId }).populate("subjectAllocId", "subject").lean();
        const assessments = await SubjectAssessment.find({ examPeriodId }).lean();
        const comments = await Comment.find({ type: "subject" }).lean();
        const attendanceList = await Attendance.find({ studentId: { $in: studentIds }, examPeriodId }).lean();
        const allSubjects = await Subject.find().lean();
        const classList = await ClassModel.find({ _id: { $in: classIds } }).lean();

        // Group data for fast lookup
        const marksByStudent = groupBy(marks, m => m.studentId.toString());
        const assessmentsByStudent = groupBy(assessments, a => a.studentId.toString());
        const commentsByStudent = groupBy(comments, c => c.studentId.toString());
        const attendanceMap = Object.fromEntries(attendanceList.map(a => [a.studentId.toString(), a]));

        const allReports = [];

        for (const cls of classList) {
            const classStudents = students.filter(st => st.class.toString() === cls._id.toString());

            for (const st of classStudents) {
                const stId = st._id.toString();

                const studentMarks = marksByStudent[stId] || [];
                const studentAssessments = assessmentsByStudent[stId] || [];
                const studentComments = commentsByStudent[stId] || [];

                // Group marks by subject
                const subjectMap = {};
                for (const mk of studentMarks) {
                    const subjId = mk.subjectAllocId?.subject?.toString();
                    if (!subjId) continue;

                    if (!subjectMap[subjId]) subjectMap[subjId] = { totalMark: 0, count: 0, paperTypes: [] };

                    subjectMap[subjId].totalMark += mk.percentage || 0;
                    subjectMap[subjId].count += 1;
                    subjectMap[subjId].paperTypes.push(mk.paperType);
                }

                const subjects = Object.entries(subjectMap).map(([subjId, data]) => {
                    const subjectName = allSubjects.find(s => s._id.toString() === subjId)?.name || "Unknown";
                    const finalMark = Math.round(data.totalMark / data.count);

                    const commentEntry = studentComments.find(c => c.subject.toString() === subjId);
                    const comment = commentEntry?.comment || "";

                    const subjectAssessment = studentAssessments.find(a => a.subject.toString() === subjId);
                    const assignment = subjectAssessment?.assignmentMark || 0;
                    const test = subjectAssessment?.testMark || 0;

                    return {
                        subject: subjectName,
                        finalMark,
                        testAvgMark: test,
                        assignmentAvgMark: assignment,
                        comment,
                        paperTypes: data.paperTypes
                    };
                });

                const att = attendanceMap[stId];
                const attendancePercentage = examPeriod.totalDays
                    ? Math.round((att?.daysPresent || 0) / examPeriod.totalDays * 100)
                    : 0;

                allReports.push({
                    name: `${st.firstname} ${st.lastname}`,
                    regNumber: st.regNumber,
                    studentId: st._id,
                    class: cls.name,
                    period: examPeriod.name,
                    attendance: attendancePercentage,
                    subjects
                });
            }
        }

        return NextResponse.json(allReports);
    } catch (error) {
        console.error("Error generating class batch reports:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
