// /src/app/api/all-reports/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

import Student from "@/models/Student";
import ClassModel from "@/models/Class";
import Mark from "@/models/Mark";
import Attendance from "@/models/Attendance";
import Comment from "@/models/Comment";
import SubjectAllocation from "@/models/SubjectAllocation";      // ← add this
import SubjectAssessment from "@/models/SubjectAssessment";
import ExamPeriod from "@/models/ExamPeriod";

export async function GET(req) {
  // 1) ensure admin
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await dbConnect();

  // 2) get active exam period
  const examPeriod = await ExamPeriod.findOne({ active: true }).lean();
  if (!examPeriod) {
    return NextResponse.json({ error: "No active exam period found" }, { status: 404 });
  }

  // 3) fetch all classes
  const classes = await ClassModel.find().lean();
  const allReports = [];

  for (const cls of classes) {
    const students = await Student.find({
      grade: cls.grade,
      section: cls.section,
    }).lean();

    for (const st of students) {
      // a) load all Marks with their allocation’s subject name
      const marks = await Mark.find({
        studentId: st._id,
        examPeriodId: examPeriod._id,
      })
        .populate("subjectAllocId", "subject")
        .lean();

      // b) load all SubjectAssessments
      const assessments = await SubjectAssessment.find({
        studentId: st._id,
        examPeriodId: examPeriod._id,
      }).lean();

      // c) group by subject name
      const bySubject = {};
      for (const m of marks) {
        const subjName = m.subjectAllocId.subject;
        bySubject[subjName] ??= { markEntries: [], allocIds: [] };
        bySubject[subjName].markEntries.push(m);
        bySubject[subjName].allocIds.push(m.subjectAllocId._id.toString());
      }

      // d) build the subjects array
      const subjects = await Promise.all(
        Object.entries(bySubject).map(async ([name, { markEntries, allocIds }]) => {
          const avgPercent = Math.round(
            markEntries.reduce((sum, x) => sum + x.percentage, 0) /
            markEntries.length
          );

          const assess = assessments.find((a) =>
            allocIds.includes(a.subjectAllocId.toString())
          );

          const subjCom = await Comment.findOne({
            studentId: st._id,
            subjectAllocId: { $in: allocIds },
            type: "subject",
          }).lean();

          return {
            name,
            behaviorGrade: assess?.behaviorGrade || "",
            assessmentTest: assess?.periodTest ?? "",
            classAverage: avgPercent,
            finalMark: avgPercent,
            subjectTeacherComment: subjCom?.text || "",
          };
        })
      );

      // e) attendance
      const att = await Attendance.findOne({ studentId: st._id }).lean();
      const attendancePercentage = examPeriod.totalDays
        ? Math.round((att?.daysPresent || 0) / examPeriod.totalDays * 100)
        : 0;

      allReports.push({
        className: `${cls.grade}-${cls.section}`,
        schoolName: "Riverside School",
        schoolLogoUrl: "/logo.png",
        name: st.name,
        regNumber: st._id.toString(),
        examPeriod: examPeriod.name,
        attendancePercentage,
        subjects,
        classTeacherComment: subjects.map((s) => s.subjectTeacherComment).join("; "),
        adminComment: "",
        aiComment: "",
      });
    }
  }

  console.log(allReports)

  return NextResponse.json(allReports);
}
