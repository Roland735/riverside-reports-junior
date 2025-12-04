import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import Comment from "@/models/Comment";

/**
 * Accepts { classId, rows: [{ studentId, text, type, _commentId?, subjectAllocId? }, ...] }
 * For each row: if _commentId provided => update by _id
 * else upsert by (studentId + type [+ subjectAllocId if provided])
 */
export async function POST(req) {
    try {
        const body = await req.json();
        const { classId, rows } = body;
        if (!rows || !Array.isArray(rows)) {
            return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
        }

        await dbConnect();

        const updated = [];

        for (const r of rows) {
            const studentId = r.studentId;
            const text = r.text ?? "";
            const type = r.type ?? "admin";
            const subjectAllocId = r.subjectAllocId ?? undefined;
            const _commentId = r._commentId ?? undefined;

            if (_commentId) {
                // update by id
                const doc = await Comment.findByIdAndUpdate(
                    _commentId,
                    { text },
                    { new: true }
                ).lean();
                if (doc) updated.push(doc);
                continue;
            }

            // build filter for upsert
            const filter = { studentId, type };
            if (subjectAllocId) filter.subjectAllocId = subjectAllocId;

            const doc = await Comment.findOneAndUpdate(
                filter,
                { $set: { text, studentId, type, subjectAllocId: subjectAllocId ?? null } },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            ).lean();

            if (doc) updated.push(doc);
        }

        return NextResponse.json({ updated });
    } catch (err) {
        console.error("POST /api/admin/admin-comments/comments/batch error:", err);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
}
