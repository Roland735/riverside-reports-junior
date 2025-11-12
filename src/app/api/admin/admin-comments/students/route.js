import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import ClassModel from "@/models/Class";
import Student from "@/models/Student";

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    if (!classId) {
        return NextResponse.json({ error: "classId required" }, { status: 400 });
    }

    await dbConnect();
    try {
        const cls = await ClassModel.findById(classId).lean();
        if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 });

        // Students reference grade + section (per your Student model); return those students
        const students = await Student.find({ grade: cls.grade, section: cls.section }).lean();
        return NextResponse.json({ students });
    } catch (err) {
        console.error("GET /api/admin/admin-comments/students error:", err);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
}
