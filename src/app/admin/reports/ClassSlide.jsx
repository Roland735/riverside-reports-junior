"use client";

import { useState, useEffect } from "react";
import { getSession } from "next-auth/react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function AdminReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeClass, setActiveClass] = useState(null);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session || session.user.role !== "admin") {
        toast.error("Unauthorized");
        return;
      }
      await fetchReports();
    })();
  }, []);

  async function fetchReports() {
    setLoading(true);
    try {
      const res = await fetch("/api/all-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: "End-Second term", year: 2025 }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReports(data);
      if (data.length > 0) {
        setActiveClass(Object.keys(groupBy(data, (r) => r.className))[0]);
      }
    } catch {
      toast.error("Failed to load reports");
    }
    setLoading(false);
  }

  async function makePdf(report) {
    const pdf = new jsPDF({
      unit: "pt",
      format: "a4",
      orientation: "portrait",
    });
    const pageWidth = pdf.internal.pageSize.getWidth();

    try {
      const img = await toDataURL(report.schoolLogoUrl);
      pdf.addImage(img, "PNG", pageWidth / 2 - 25, 10, 50, 50);
    } catch {}
    try {
      const qr = await QRCode.toDataURL(
        `https://example.com/student/${report.regNumber}`
      );
      pdf.addImage(qr, "PNG", pageWidth - 80, 20, 60, 60);
    } catch {}

    pdf
      .setFontSize(14)
      .setTextColor(33)
      .text(report.schoolName, 40, 80)
      .setFontSize(12)
      .text(`Student Report: ${report.name}`, 40, 100)
      .text(`Reg#: ${report.regNumber}`, 40, 115)
      .text(`Exam Period: ${report.examPeriod}`, 40, 130)
      .text(`Attendance: ${report.attendancePercentage}%`, 40, 145);

    autoTable(pdf, {
      startY: 160,
      margin: { left: 40, right: 40 },
      tableWidth: pageWidth - 80,
      head: [["A*", "A", "B", "C", "D", "E", "F"]],
      body: [
        ["90-100", "80-89", "70-79", "60-69", "50-59", "40-49", "<40"],
        [
          "Outstanding",
          "Very Good",
          "Good",
          "Satisfactory",
          "Needs Improvement",
          "Below Expectations",
          "Concern",
        ],
      ],
      headStyles: { fillColor: [47, 50, 56], textColor: [255, 255, 255] },
      theme: "grid",
      styles: { fontSize: 9 },
    });

    const rows = report.subjects.map((s, i) => [
      i + 1,
      s.name,
      s.behaviorGrade || "",
      s.classAverage,
      s.finalMark,
      grade(s.finalMark),
      s.subjectTeacherComment,
    ]);

    autoTable(pdf, {
      startY: pdf.lastAutoTable.finalY + 20,
      margin: { left: 40, right: 40 },
      tableWidth: pageWidth - 80,
      head: [["#", "Subject", "Behav.", "Avg", "Final", "Grade", "Comment"]],
      body: rows,
      headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
      theme: "grid",
      styles: { fontSize: 9 },
    });

    const y = pdf.lastAutoTable.finalY + 20;
    pdf
      .setFontSize(12)
      .setTextColor(60)
      .text(`Class Teacher Comment: ${report.classTeacherComment}`, 40, y)
      .text(`Admin Comment: ${report.adminComment}`, 40, y + 16)
      .text(`AI Comment: ${report.aiComment}`, 40, y + 32)
      .text("Signature: ______________________", 40, y + 60);

    return pdf;
  }

  async function downloadAll() {
    const zip = new JSZip();
    const groups = groupBy(reports, (r) => r.className);

    try {
      for (const cls of Object.keys(groups)) {
        const folder = zip.folder(cls);
        for (const rep of groups[cls]) {
          const pdf = await makePdf(rep);
          const blob = pdf.output("blob");
          folder.file(`${rep.name}-report.pdf`, blob);
        }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `reports-${Date.now()}.zip`);
      toast.success("Downloaded all reports");
    } catch (error) {
      toast.error("Failed to generate reports");
      console.error(error);
    }
  }

  const prepareChartData = (report) =>
    report.subjects.map((subject) => ({
      subject: subject.name.substring(0, 12),
      "Student Score": subject.finalMark,
      "Class Average": subject.classAverage,
    }));

  const groupedReports = groupBy(reports, (r) => r.className);
  const classNames = Object.keys(groupedReports);

  return (
    <div className="overflow-x-hidden p-6 bg-gradient-to-br from-slate-900 to-slate-800 min-h-screen text-white">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Student Performance Reports
          </h1>
          <p className="text-slate-400">
            View and manage student academic reports
          </p>
        </header>

        <div className="flex items-center justify-between mb-6">
          <button
            onClick={downloadAll}
            disabled={loading || !reports.length}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-5 py-3 rounded-lg shadow-lg transition disabled:opacity-50 flex items-center gap-2"
          >
            {/* Download icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            {loading ? "Loading Reports..." : "Download All Reports"}
          </button>

          {classNames.length > 0 && (
            <div className="flex gap-2">
              {classNames.map((cls) => (
                <button
                  key={cls}
                  onClick={() => setActiveClass(cls)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    activeClass === cls
                      ? "bg-red-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          /* skeleton loaders */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-slate-800 rounded-xl p-5 h-80 animate-pulse"
              >
                <div className="h-6 bg-slate-700 rounded mb-4 w-3/4" />
                <div className="h-4 bg-slate-700 rounded mb-2 w-1/2" />
                <div className="h-48 bg-slate-700 rounded mt-4" />
              </div>
            ))}
          </div>
        ) : !reports.length ? (
          /* no reports */
          <div className="text-center py-12 bg-slate-800/50 rounded-xl">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16 mx-auto text-slate-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="text-xl font-medium mt-4">No Reports Available</h3>
            <p className="text-slate-500 mt-2">
              No student reports found for the selected period
            </p>
          </div>
        ) : (
          /* slides */
          <div className="space-y-8">
            {activeClass &&
              groupedReports[activeClass].map((report) => (
                <div
                  key={report.regNumber}
                  className="w-full min-h-screen flex flex-col bg-gradient-to-br from-red-800/50 to-slate-900/50 rounded-2xl shadow-xl overflow-hidden border border-slate-700/30"
                >
                  <div className="p-5 flex-1 flex flex-col">
                    {/* header */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-2xl">{report.name}</h3>
                        <p className="text-slate-400 text-sm">
                          {report.regNumber} | {report.className}
                        </p>
                      </div>
                      <span className="bg-slate-800 px-3 py-1 rounded-full text-sm">
                        {report.attendancePercentage}% Attendance
                      </span>
                    </div>

                    {/* chart */}
                    <div className="flex-1 h-1/2 mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={prepareChartData(report)}
                          margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#334155"
                          />
                          <XAxis dataKey="subject" stroke="#94a3b8" />
                          <YAxis
                            stroke="#94a3b8"
                            domain={[0, 100]}
                            tickCount={6}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0f172a",
                              border: "1px solid #1e293b",
                              borderRadius: "0.5rem",
                            }}
                            itemStyle={{ color: "#f8fafc" }}
                          />
                          <Legend />
                          <Bar
                            dataKey="Student Score"
                            fill="#ef4444"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="Class Average"
                            fill="#64748b"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* subjects table */}
                    <div className="mt-6 overflow-auto max-h-40">
                      <table className="min-w-full divide-y divide-slate-600 text-sm">
                        <thead>
                          <tr className="bg-slate-700">
                            <th className="px-3 py-1 text-left text-white">
                              Subject
                            </th>
                            <th className="px-3 py-1 text-right text-white">
                              Avg
                            </th>
                            <th className="px-3 py-1 text-right text-white">
                              Final
                            </th>
                            <th className="px-3 py-1 text-center text-white">
                              Grade
                            </th>
                            <th className="px-3 py-1 text-left text-white">
                              Comment
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-600">
                          {report.subjects.map((s, i) => (
                            <tr key={i}>
                              <td className="px-3 py-1">{s.name}</td>
                              <td className="px-3 py-1 text-right">
                                {s.classAverage}
                              </td>
                              <td className="px-3 py-1 text-right">
                                {s.finalMark}
                              </td>
                              <td className="px-3 py-1 text-center">
                                {grade(s.finalMark)}
                              </td>
                              <td className="px-3 py-1">
                                {s.subjectTeacherComment}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* footer */}
                    <div className="flex justify-between mt-6">
                      <div className="text-sm">
                        <p>
                          <span className="text-slate-400">
                            Overall Grade:{" "}
                          </span>
                          <span className="font-medium">
                            {grade(
                              report.subjects.reduce(
                                (sum, subj) => sum + subj.finalMark,
                                0
                              ) / report.subjects.length
                            )}
                          </span>
                        </p>
                        <p>
                          <span className="text-slate-400">Subjects: </span>
                          <span>{report.subjects.length}</span>
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const pdf = await makePdf(report);
                            pdf.save(`${report.name}-report.pdf`);
                            toast.success("Report downloaded");
                          } catch {
                            toast.error("Failed to download report");
                          }
                        }}
                        className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Helpers
function groupBy(arr, fn) {
  return arr.reduce((acc, v) => {
    const key = fn(v);
    (acc[key] ||= []).push(v);
    return acc;
  }, {});
}
function grade(m) {
  if (m >= 90) return "A*";
  if (m >= 80) return "A";
  if (m >= 70) return "B";
  if (m >= 60) return "C";
  if (m >= 50) return "D";
  if (m >= 40) return "E";
  return "F";
}
async function toDataURL(url) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error("No URL provided"));
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL());
    };
    img.onerror = reject;
    img.src = url;
  });
}
