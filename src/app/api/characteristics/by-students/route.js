// src/app/api/characteristics/by-students/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import CambridgeCharacteristic from "../../../../models/CharacteristicCambridge";

export async function POST(req) {
    const body = await req.json().catch(() => ({}));
    const { studentIds } = body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return NextResponse.json({ error: "studentIds must be a non-empty array" }, { status: 400 });
    }

    await dbConnect();

    try {
        // Mongoose will cast string ids to ObjectId automatically when matching
        const docs = await CambridgeCharacteristic.find({
            studentId: { $in: studentIds }
        }).lean();

        // Return as array of docs
        return NextResponse.json({ ok: true, docs });
    } catch (err) {
        console.error("Failed to fetch characteristics by students:", err);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
}
