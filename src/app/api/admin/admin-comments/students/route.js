import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import ClassModel from "@/models/Class";
import Student from "@/models/Student";
import Mark from "@/models/Mark";
import Comment from "@/models/Comment";

/**
 * GET /api/admin/admin-comments/students?classId=...
 *
 * Returns students for classId with:
 * - marksBySubject: [{ subject, avgPercentage, outOf50, components: [...] }]
 * - overallOutOf50
 * - subjectComments: [{ subject, text }]
 * - adminCommentId & adminCommentText (if exists)
 *
 * Uses populate("subjectAllocId", "subject paper") and follows same mark->percentage logic
 * as your all-reports route.
 */

function derivePercentage(m) {
    // Try in order: explicit percentage -> mark/totalMarks -> interpret mark as either out-of-50 or raw
    if (m == null) return null;
    if (typeof m.percentage === "number" && !Number.isNaN(m.percentage)) return m.percentage;
    if (typeof m.mark === "number" && typeof m.totalMarks === "number" && m.totalMarks > 0) {
        return (m.mark / m.totalMarks) * 100;
    }
    if (typeof m.mark === "number") {
        // If mark looks like it's already out of 50 (<=50) treat it as out-of-50 and convert to pct
        if (m.mark <= 50) return (m.mark / 50) * 100;
        // else if it's greater than 50 but no totalMarks, assume it's percentage-like already
        return m.mark;
    }
    return null;
}

function to50FromPercentage(pct) {
    if (pct == null || Number.isNaN(Number(pct))) return 0;
    const n = Number(pct);
    // n is a percentage (0-100). Convert to 0-50
    return Math.round((n / 100) * 50);
}

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

        // students in the class (grade + section)
        const students = await Student.find({ grade: cls.grade, section: cls.section }).lean();
        if (!students || !students.length) {
            return NextResponse.json({ students: [] });
        }

        const studentIds = students.map((s) => String(s._id));

        // Fetch marks and populate subjectAllocId so we can get subject name
        const marks = await Mark.find({ studentId: { $in: studentIds } })
            .populate("subjectAllocId", "subject paper")
            .lean();

        // Fetch subject comments (type=subject)
        const subjComments = await Comment.find({
            studentId: { $in: studentIds },
            type: "subject",
        })
            .populate("subjectAllocId", "subject")
            .lean();

        // Fetch admin comments (type=admin) for convenience
        const adminComments = await Comment.find({
            studentId: { $in: studentIds },
            type: "admin",
        }).lean();

        // Build marks map per student -> subjectName -> list of percentages
        const marksMap = {}; // marksMap[studentId][subjectName] = { label, values: [], components: [] }
        for (const m of marks) {
            const sid = String(m.studentId);
            // subject name best-effort:
            const subjName =
                (m.subjectAllocId && (m.subjectAllocId.subject || m.subjectAllocId.name)) ||
                "General";

            const pct = derivePercentage(m);
            if (pct == null || Number.isNaN(Number(pct))) continue;

            marksMap[sid] = marksMap[sid] || {};
            marksMap[sid][subjName] = marksMap[sid][subjName] || { subjectLabel: subjName, values: [], components: [] };

            marksMap[sid][subjName].values.push(pct);
            marksMap[sid][subjName].components.push({
                markId: m._id,
                paper: m.paper ?? m.component ?? null,
                percentage: pct,
                value50: to50FromPercentage(pct),
                subjectAllocId: m.subjectAllocId?._id ?? null,
            });
        }

        // Build subject comments map
        const subjCommentMap = {}; // subjCommentMap[studentId] = [{ subject, text }]
        for (const c of subjComments) {
            const sid = String(c.studentId);
            const subjName = (c.subjectAllocId && (c.subjectAllocId.subject || c.subjectAllocId.name)) || "General";
            subjCommentMap[sid] = subjCommentMap[sid] || [];
            subjCommentMap[sid].push({ subject: subjName, text: c.text, _id: c._id });
        }

        // admin comments map (pick latest if multiple)
        const adminCommentMap = {};
        for (const c of adminComments) {
            const sid = String(c.studentId);
            if (!adminCommentMap[sid]) adminCommentMap[sid] = c;
            else {
                const prev = adminCommentMap[sid];
                const prevTime = prev?.updatedAt ?? prev?.createdAt ?? null;
                const curTime = c?.updatedAt ?? c?.createdAt ?? null;
                if (curTime && prevTime && new Date(curTime) > new Date(prevTime)) {
                    adminCommentMap[sid] = c;
                }
            }
        }

        // Build output students
        const outStudents = students.map((st) => {
            const sid = String(st._id);
            const subjBuckets = marksMap[sid] || {};
            const perSubject = [];

            for (const key of Object.keys(subjBuckets)) {
                const bucket = subjBuckets[key];
                const values = bucket.values || [];
                if (!values.length) continue;
                const sum = values.reduce((a, b) => a + b, 0);
                const avgPct = sum / values.length;
                const outOf50 = to50FromPercentage(avgPct);

                perSubject.push({
                    subject: bucket.subjectLabel || key,
                    avgPercentage: avgPct,
                    outOf50,
                    components: bucket.components || [],
                });
            }

            // overall outOf50 is average of subject avgPercentages converted to 0-50
            let overallOutOf50 = null;
            if (perSubject.length) {
                const avgPct =
                    perSubject.reduce((a, b) => a + (b.avgPercentage || 0), 0) / perSubject.length;
                overallOutOf50 = to50FromPercentage(avgPct);
            }

            return {
                ...st,
                _id: st._id,
                gender: st.gender ?? null,
                marksBySubject: perSubject,
                overallOutOf50,
                subjectComments: subjCommentMap[sid] || [],
                adminCommentId: adminCommentMap[sid]?._id ?? null,
                adminCommentText: adminCommentMap[sid]?.text ?? "",
            };
        });

        return NextResponse.json({ students: outStudents });
    } catch (err) {
        console.error("GET /api/admin/admin-comments/students error:", err);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
}
