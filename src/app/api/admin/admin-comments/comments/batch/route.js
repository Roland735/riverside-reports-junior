import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import Comment from "@/models/Comment";
import mongoose from "mongoose";

/**
 * POST body:
 * {
 *   classId: "...",           // optional but passed from client
 *   rows: [ { studentId, text, type: 'admin', _commentId? }, ... ]
 * }
 *
 * Response:
 *  { ok: true, updated: [{ studentId, _id, text }, ...] }
 */

export async function POST(req) {
    const body = await req.json().catch(() => ({}));
    const { rows } = body;
    if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: "rows must be a non-empty array" }, { status: 400 });
    }

    await dbConnect();
    try {
        const ops = rows.map((r) => {
            // if _commentId provided -> update by _id
            if (r._commentId) {
                return {
                    updateOne: {
                        filter: { _id: mongoose.Types.ObjectId(r._commentId) },
                        update: { $set: { text: r.text ?? "", updatedAt: new Date() } },
                    },
                };
            }
            // otherwise upsert by studentId + type + subjectAllocId (admin comments have no subjectAllocId)
            const filter = { studentId: r.studentId, type: r.type ?? "admin" };
            return {
                updateOne: {
                    filter,
                    update: { $set: { text: r.text ?? "", type: r.type ?? "admin", studentId: r.studentId, updatedAt: new Date() } },
                    upsert: true,
                },
            };
        });

        const bulk = await Comment.bulkWrite(ops, { ordered: false });
        // After bulkWrite, fetch the resulting/affected documents for returning _ids and text:
        const studentIds = rows.map((r) => r.studentId);
        const docs = await Comment.find({ studentId: { $in: studentIds }, type: "admin" }).lean();

        const updated = docs.map((d) => ({ studentId: String(d.studentId), _id: String(d._id), text: d.text }));

        return NextResponse.json({ ok: true, updated });
    } catch (err) {
        console.error("POST /api/admin/admin-comments/comments/batch error:", err);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
}
