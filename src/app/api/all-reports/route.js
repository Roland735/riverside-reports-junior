// server: src/app/api/all-reports/route.js
"use server";

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

import Student from "@/models/Student";
import ClassModel from "@/models/Class";
import Mark from "@/models/Mark";
import Attendance from "@/models/Attendance";
import Comment from "@/models/Comment";
import ExamPeriod from "@/models/ExamPeriod";
import SubjectAllocation from "@/models/SubjectAllocation";

/**
 * weightMap
 * (kept the map you provided — adjust as needed)
 */
const weightMap = {
  "A Level ": {
    "Form 6": {
      "Business Studies": { "1": 0.2, "2": 0.3, "3": 0.3, "4": 0.2 },
      "Mathematics": { "1": 0.3, "3": 0.3, "4": 0.2, "6": 0.2, "5": 0.2 },
      "Accounting": { "1": 0.14, "2": 0.36, "3": 0.3, "4": 0.2 },
      "Economics": { "1": 0.13, "2": 0.33, "3": 0.13, "4": 0.33 }
    },
    "Form 5": {
      "Business Studies": { "1": 0.4, "2": 0.6 },
      "Accounting": { "1": 0.28, "2": 0.72 },
      "Economics": { "1": 0.33, "2": 0.67 },
      "Mathematics": { "1": 0.6, "5": 0.4 },
      "Physics": { "1": 0.3, "2": 0.5, "3": 0.2 },
    }
  },
  "Form 4": {
    "Blue": {
      "Accounting": { "1": 0.3, "2": 0.7 },
      "Economics": { "1": 0.3, "2": 0.7 },
      "Biology": { "2": 0.3, "4": 0.5, "6": 0.2 }
    }
  },
  "Form 3": {
    "Blue": {
      "Physics": { "1": 0.4, "2": 0.6 },
    },
    "Green": {
      "Physics": { "1": 0.4, "2": 0.6 },
    },
  }
};

/**
 * value50({ mark, totalMarks, percentage })
 * Convert a mark to 0-50 scale using:
 *  - If totalMarks > 0: (mark / totalMarks) * 50
 *  - Else if percentage provided: if percentage <=50 treat as already 0-50 else scale 0-100 -> 0-50
 *  - Else fallback to heuristics on mark value.
 */
function value50({ mark, totalMarks, percentage }) {
  const mk = mark == null ? null : Number(mark);
  const tm = totalMarks == null ? null : Number(totalMarks);
  const pct = percentage == null ? null : Number(percentage);

  // use explicit totalMarks when available and >0
  if (tm && tm > 0 && mk != null && !Number.isNaN(mk)) {
    // clamp result to 0..50
    const v = Math.round((mk / tm) * 50);
    return Math.max(0, Math.min(50, v));
  }

  // fallback to percentage field if present
  if (pct != null && !Number.isNaN(pct)) {
    if (pct <= 50) return Math.round(pct); // already on 0-50 scale
    // percentage is 0-100 -> scale to 0-50
    return Math.max(0, Math.min(50, Math.round((pct / 100) * 50)));
  }

  // fallback to mark heuristics
  if (mk != null && !Number.isNaN(mk)) {
    if (mk <= 50) return Math.round(mk);
    if (mk <= 100) return Math.max(0, Math.min(50, Math.round((mk / 100) * 50)));
    // otherwise just clamp
    return Math.max(0, Math.min(50, Math.round(mk)));
  }

  return 0;
}

export async function GET(req) {
  // auth
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await dbConnect();

  const examPeriod = await ExamPeriod.findOne({ active: true }).lean();
  if (!examPeriod) {
    return NextResponse.json({ error: "No active exam period found" }, { status: 404 });
  }

  const classes = await ClassModel.find().lean();

  const nested = await Promise.all(
    classes.map(async (cls) => {
      const gradeKey = cls.grade;
      const sectionKey = cls.section;

      const students = await Student.find({ grade: gradeKey, section: sectionKey }).select("_id name").lean();
      const ids = students.map((s) => s._id);

      const [allMarks, allComments, allAtt] = await Promise.all([
        Mark.find({ studentId: { $in: ids }, examPeriodId: examPeriod._id })
          .populate("subjectAllocId", "subject paper")
          .lean(),
        // include admin comments in the query so we can place them into schoolHeadRemarks
        Comment.find({ studentId: { $in: ids }, type: { $in: ["subject", "classteacher", "admin"] } })
          .populate("subjectAllocId", "subject")
          .lean(),
        Attendance.find({ studentId: { $in: ids } }).lean(),
      ]);

      const marksByStudent = allMarks.reduce((acc, m) => { (acc[String(m.studentId)] ||= []).push(m); return acc; }, {});
      const subjCommentsByStudent = {};
      const classCommentsByStudent = {};
      const adminCommentsByStudent = {};
      allComments.forEach((c) => {
        const sid = String(c.studentId);
        if (c.type === "subject") {
          subjCommentsByStudent[sid] ||= [];
          subjCommentsByStudent[sid].push(c);
        } else if (c.type === "classteacher") {
          classCommentsByStudent[sid] ||= [];
          classCommentsByStudent[sid].push(c);
        } else if (c.type === "admin") {
          adminCommentsByStudent[sid] ||= [];
          adminCommentsByStudent[sid].push(c);
        }
      });
      const attByStudent = allAtt.reduce((acc, a) => { acc[String(a.studentId)] = a; return acc; }, {});

      return Promise.all(students.map((st) => {
        const sid = String(st._id);
        const studentMarks = marksByStudent[sid] || [];
        const studentSubjComments = subjCommentsByStudent[sid] || [];
        const studentClassComments = classCommentsByStudent[sid] || [];
        const studentAdminComments = adminCommentsByStudent[sid] || [];
        const attendance = attByStudent[sid] || { daysPresent: 0 };

        // gather subject names present in marks/comments
        const subjectNames = Array.from(new Set([
          ...studentMarks.map((m) => m.subjectAllocId?.subject).filter(Boolean),
          ...studentSubjComments.map((c) => c.subjectAllocId?.subject).filter(Boolean),
        ]));

        const subjects = subjectNames.map((subjName) => {
          const marks = studentMarks.filter((m) => m.subjectAllocId && m.subjectAllocId.subject === subjName);

          // build components with value50 using provided mark/totalMarks/percentage
          const components = marks.map((m) => {
            const compId = m.component ?? m.paper ?? String(m._id);
            const v50 = value50({ mark: m.mark, totalMarks: m.totalMarks, percentage: m.percentage });
            return {
              component: compId,
              value50: v50,
              rawMark: m.mark,
              totalMarks: m.totalMarks,
              percentage: m.percentage,
              markId: m._id,
              subjectAllocId: m.subjectAllocId?._id ?? null,
            };
          });

          // values for calculations
          const markVals50 = components.map((c) => c.value50).filter((v) => typeof v === "number");

          const weights = weightMap[gradeKey]?.[sectionKey]?.[subjName] || null;
          let finalMark = 0;

          if (weights && Object.keys(weights).length) {
            // compute weighted sum using only present components and normalize by sum of present weights
            const entries = Object.entries(weights);
            let weightedSum = 0;
            let presentWeightSum = 0;

            for (const [comp, wt] of entries) {
              const compObj = components.find((c) => String(c.component) === String(comp));
              if (compObj) {
                weightedSum += compObj.value50 * Number(wt);
                presentWeightSum += Number(wt);
              }
              // if component missing -> skip (do not substitute first mark)
            }

            if (presentWeightSum > 0) {
              finalMark = Math.round(weightedSum / presentWeightSum);
            } else {
              // no weighted components present -> fall back to average of available components (0-50)
              finalMark = markVals50.length ? Math.round(markVals50.reduce((s, x) => s + x, 0) / markVals50.length) : 0;
            }
          } else {
            // no weights defined -> average of available components (on 0-50 scale)
            finalMark = markVals50.length ? Math.round(markVals50.reduce((s, x) => s + x, 0) / markVals50.length) : 0;
          }

          // safety clamp: ensure finalMark lies within 0..50
          if (finalMark < 0) finalMark = 0;
          if (finalMark > 50) finalMark = 50;

          const comment = studentSubjComments.find((c) => c.subjectAllocId?.subject === subjName);

          return {
            name: subjName,
            finalMark,
            classAverage: markVals50.length ? Math.round(markVals50.reduce((s, x) => s + x, 0) / markVals50.length) : 0,
            subjectTeacherComment: comment?.text || "",
            components,
            didAttempt: finalMark > 0,
          };
        });

        // compute student's average across ALL papers (flatten all components)
        const allComponents = subjects.flatMap((s) => s.components || []);
        const allComponentValues = allComponents.map((c) => c.value50).filter((v) => typeof v === "number");
        const studentAveragePapers = allComponentValues.length ? Math.round(allComponentValues.reduce((s, x) => s + x, 0) / allComponentValues.length) : 0;

        // compute student's average across subjects (average of subject finalMark)
        const subjectFinals = subjects.map((s) => Number(s.finalMark || 0)).filter((v) => !Number.isNaN(v));
        const studentAverageSubjects = subjectFinals.length ? Math.round(subjectFinals.reduce((s, x) => s + x, 0) / subjectFinals.length) : 0;

        const totalPoints = subjects.reduce((s, sub) => s + (Number(sub.finalMark || 0)), 0);

        // format term ending date similar to sample (07 August 2025)
        const termEnding = examPeriod.endDate ? new Date(examPeriod.endDate).toLocaleDateString("en-GB", {
          day: "2-digit", month: "long", year: "numeric"
        }) : null;

        // Admin comments (if any) are used for the head's remarks. If none, fall back to env var.
        const adminHeadRemarks = (studentAdminComments || []).map((c) => c.text).join(" • ");
        const headRemarks = adminHeadRemarks && adminHeadRemarks.trim() ? adminHeadRemarks : (process.env.SCHOOL_HEAD_REMARKS || "—");

        return {
          className: `${gradeKey}-${sectionKey}`,
          name: st.name,
          regNumber: sid,
          examPeriod: examPeriod.name,
          termEnding,
          schoolName: process.env.SCHOOL_NAME || "RIVERSIDE SCHOOL",
          schoolLogoUrl: "/logo.png",
          attendanceDays: attendance.daysPresent ?? 0,
          attendancePercentage: examPeriod.totalDays ? Math.round((attendance.daysPresent / examPeriod.totalDays) * 100) : 0,
          subjects,
          totalPoints,
          // new: averages across papers and across subjects (both out of 50)
          studentAveragePapers,
          studentAverageSubjects,
          classTeacherComment: (studentClassComments || []).map((c) => c.text).join(" • "),
          schoolHeadRemarks: headRemarks,
        };
      }));
    })
  );

  const allReports = nested.flat();
  const classNameParam = req.nextUrl.searchParams.get("className");
  const output = classNameParam ? allReports.filter((r) => r.className === classNameParam) : allReports;

  return NextResponse.json(output);
}
