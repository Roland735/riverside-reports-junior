// src/app/api/characteristics/class-batch/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import CambridgeCharacteristic from "../../../../models/CharacteristicCambridge";
import mongoose from "mongoose";

const CAMBRIDGE_GRADES = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'];

export async function POST(req) {
    const body = await req.json().catch(() => ({}));
    const { classId, examPeriodId, rows } = body;

    if (!rows || !Array.isArray(rows)) {
        return NextResponse.json({ error: "Invalid rows" }, { status: 400 });
    }

    await dbConnect();

    const errors = [];
    let savedCount = 0;

    // Process rows sequentially to collect per-row errors (could be parallel if preferred)
    for (const r of rows) {
        // basic shape validation
        if (!r || !r.studentId) {
            errors.push({ studentId: r?.studentId || null, error: "Missing studentId" });
            continue;
        }

        // validate grade values
        const invalids = [];
        ['punctuality', 'behaviour', 'dressing', 'attendance'].forEach(f => {
            const v = r[f];
            if (!CAMBRIDGE_GRADES.includes(v)) invalids.push({ field: f, value: v });
        });
        if (invalids.length) {
            errors.push({ studentId: r.studentId, error: `Invalid grades: ${JSON.stringify(invalids)}` });
            continue;
        }

        try {
            // --- Fix: DO NOT call mongoose.Types.ObjectId as a function ---
            // Creating ObjectId with `new mongoose.Types.ObjectId(...)` would also work,
            // but Mongoose will cast a plain string to ObjectId for us, so simplest is:
            const filter = { studentId: r.studentId };

            const update = {
                punctuality: r.punctuality,
                behaviour: r.behaviour,
                dressing: r.dressing,
                attendance: r.attendance,
            };

            await CambridgeCharacteristic.findOneAndUpdate(filter, update, {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            });

            savedCount++;
        } catch (err) {
            console.error(`Failed save for ${r.studentId}`, err);
            errors.push({ studentId: r.studentId, error: err.message || "DB error" });
        }
    }

    return NextResponse.json({ ok: true, savedCount, errors });
}
