// src/app/api/comments/class-template/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import Student from "@/models/Student";
import Mark from "@/models/Mark";
import Comment from "@/models/Comment";
import ClassModel from "@/models/Class";
import SubjectAllocation from "@/models/SubjectAllocation";
import Attendance from "@/models/Attendance";
import ExamPeriod from "@/models/ExamPeriod";

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const examPeriodId = searchParams.get("examPeriodId");

    await dbConnect();

    // 1. Load class and exam‑period metadata
    const cls = await ClassModel.findById(classId).lean();
    if (!cls) {
        return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }
    const period = await ExamPeriod.findById(examPeriodId).lean();
    const totalDays = period?.totalDays || 0;

    // 2. Fetch all students in that grade/section
    const students = await Student.find({
        grade: cls.grade,
        section: cls.section
    }).lean();

    // 3. Build each row, grouping papers by subject
    const rows = await Promise.all(students.map(async st => {
        // fetch all mark documents for this student & period
        const marks = await Mark.find({ studentId: st._id, examPeriodId }).lean();

        // map each mark to its subject name & percentage
        const raw = await Promise.all(marks.map(async m => {
            const alloc = await SubjectAllocation.findById(m.subjectAllocId).lean();
            return {
                subject: alloc.subject,
                percentage: m.percentage
            };
        }));

        // group by subject → average the percentages
        const grouped = raw.reduce((acc, { subject, percentage }) => {
            if (!acc[subject]) acc[subject] = [];
            acc[subject].push(percentage);
            return acc;
        }, {});
        const subjects = Object.entries(grouped).map(([subject, arr]) => ({
            subject,
            percentage: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
        }));

        const com = await Comment.findOne({ studentId: st._id, type: "classteacher" }).lean();
        const att = await Attendance.findOne({ studentId: st._id }).lean();

        return {
            studentId: st._id.toString(),
            name: st.name,
            subjects,                   // now one entry per subject
            comment: com?.text || "",
            attendance: att?.daysPresent ?? 0
        };
    }));

    // 4. Compute class‑wide averages using these grouped percentages
    const allPerc = rows.flatMap(r => r.subjects.map(s => s.percentage));
    const averagePercent = allPerc.length
        ? Math.round(allPerc.reduce((a, b) => a + b, 0) / allPerc.length)
        : 0;

    // 5. Build the unique subject list
    const subjectList = Array.from(
        new Set(rows.flatMap(r => r.subjects.map(s => s.subject)))
    );

    return NextResponse.json({
        rows,
        classInfo: {
            grade: cls.grade,
            section: cls.section,
            averagePercent,
            subjects: subjectList,
            totalDays
        }
    });
}
