// src/app/api/comments/class-batch/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import Comment from "@/models/Comment";
import Attendance from "@/models/Attendance";

export async function POST(req) {
    const { classId, examPeriodId, rows } = await req.json();
    await dbConnect();

    await Promise.all(rows.map(async r => {
        // upsert classteacher comment
        await Comment.findOneAndUpdate(
            { studentId: r.studentId, type: "classteacher" },
            { $set: { text: r.comment } },
            { upsert: true }
        );
        // upsert attendance
        await Attendance.findOneAndUpdate(
            { studentId: r.studentId },
            { $set: { daysPresent: r.attendance } },
            { upsert: true }
        );
    }));

    return NextResponse.json({ success: true });
}
