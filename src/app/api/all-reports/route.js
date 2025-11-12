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

// weightMap (paste your existing map here)
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

// Helper: convert values to 0-50 scale.
// If stored as percentage (0-100) scale down; if already <=50 leave.
function to50(value) {
  if (value == null || Number.isNaN(Number(value))) return 0;
  const n = Number(value);
  if (n <= 50) return Math.round(n);
  return Math.round((n / 100) * 50);
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

        // gather subject names
        const subjectNames = Array.from(new Set([
          ...studentMarks.map((m) => m.subjectAllocId?.subject).filter(Boolean),
          ...studentSubjComments.map((c) => c.subjectAllocId?.subject).filter(Boolean),
        ]));

        const subjects = subjectNames.map((subjName) => {
          const marks = studentMarks.filter((m) => m.subjectAllocId && m.subjectAllocId.subject === subjName);

          // convert mark/percentage to 0-50 values
          const markVals50 = marks.map((m) => to50(m.percentage ?? m.mark ?? 0)).filter((v) => typeof v === "number");

          const weights = weightMap[gradeKey]?.[sectionKey]?.[subjName] || null;
          let finalMark = 0;

          if (weights && Object.keys(weights).length) {
            finalMark = Object.entries(weights).reduce((sum, [comp, wt]) => {
              const entry = marks.find((e) => String(e.component) === String(comp) || String(e.paper) === String(comp));
              const val = entry ? to50(entry.percentage ?? entry.mark ?? 0) : (markVals50[0] ?? 0);
              return sum + val * wt;
            }, 0);
            finalMark = Math.round(finalMark);
          } else {
            finalMark = markVals50.length ? Math.round(markVals50.reduce((s, x) => s + x, 0) / markVals50.length) : 0;
          }

          const comment = studentSubjComments.find((c) => c.subjectAllocId?.subject === subjName);

          const components = marks.map((m) => ({
            component: m.component ?? m.paper ?? String(m._id),
            value50: to50(m.percentage ?? m.mark ?? 0),
            markId: m._id,
            subjectAllocId: m.subjectAllocId?._id ?? null,
          }));

          return {
            name: subjName,
            finalMark,
            classAverage: markVals50.length ? Math.round(markVals50.reduce((s, x) => s + x, 0) / markVals50.length) : 0,
            subjectTeacherComment: comment?.text || "",
            components,
            didAttempt: finalMark > 0,
          };
        });

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
