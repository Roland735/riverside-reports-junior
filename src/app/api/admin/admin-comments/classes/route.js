import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import ClassModel from "@/models/Class";
import Student from "@/models/Student";

export async function GET() {
    await dbConnect();
    try {
        const classes = await ClassModel.find({}).lean();
        // compute student counts (grade+section)
        const enhanced = await Promise.all(
            classes.map(async (c) => {
                const count = await Student.countDocuments({ grade: c.grade, section: c.section });
                return { ...c, studentCount: count };
            })
        );
        return NextResponse.json({ classes: enhanced });
    } catch (err) {
        console.error("GET /api/admin/admin-comments/classes error:", err);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
}
