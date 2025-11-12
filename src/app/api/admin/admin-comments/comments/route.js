import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import Comment from "@/models/Comment";

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const studentIdsParam = searchParams.get("studentIds"); // csv
    const type = searchParams.get("type") ?? undefined;

    if (!studentIdsParam) {
        return NextResponse.json({ error: "studentIds required" }, { status: 400 });
    }

    const studentIds = studentIdsParam.split(",").map((s) => s.trim()).filter(Boolean);

    await dbConnect();
    try {
        const q = { studentId: { $in: studentIds } };
        if (type) q.type = type;
        const docs = await Comment.find(q).lean();
        return NextResponse.json({ comments: docs });
    } catch (err) {
        console.error("GET /api/admin/admin-comments/comments error:", err);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
}
