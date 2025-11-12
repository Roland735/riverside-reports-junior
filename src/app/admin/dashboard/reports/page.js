// /src/app/admin/reports/page.jsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { getSession } from "next-auth/react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import {
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    Legend,
    ResponsiveContainer,
} from "recharts";

/**
 * AdminReportsPage
 * - QR code placed at bottom-right corner of the PDF.
 * - Table header labels use full words (no mid-word splitting).
 * - SUBJECT column reduced; TEACHER'S COMMENT column increased.
 * - Black text in PDF set to a truer/darker black.
 * - Class teacher's comment and Head's remarks printed with extra spacing and indentation.
 */

export default function AdminReportsPage() {
    const [reports, setReports] = useState([]);
    const [classList, setClassList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedClass, setSelectedClass] = useState("");

    function groupBy(arr, fn) {
        return arr.reduce((acc, v) => {
            (acc[fn(v)] ||= []).push(v);
            return acc;
        }, {});
    }

    function normalizeSubjects(rawSubjects = []) {
        const groups = groupBy(rawSubjects, (s) => s.name);
        return Object.entries(groups).map(([name, entries]) => {
            const finals = entries.map((e) => Number(e.finalMark ?? 0));
            const avgFinal = finals.length ? Math.round(finals.reduce((sum, m) => sum + m, 0) / finals.length) : 0;
            const subjectTeacherComment = entries.find((e) => e.subjectTeacherComment)?.subjectTeacherComment || "";
            return { name, finalMark: avgFinal, subjectTeacherComment };
        });
    }

    const classAvgMap = useMemo(() => {
        const allRaw = reports.flatMap((r) => r.subjects || []);
        const grouped = groupBy(allRaw, (s) => s.name);
        return Object.fromEntries(
            Object.entries(grouped).map(([name, entries]) => {
                const avg = Math.round(entries.reduce((sum, e) => sum + (Number(e.finalMark) || 0), 0) / Math.max(1, entries.length));
                return [name, avg];
            })
        );
    }, [reports]);

    function getSubjectsWithClassAvg(rawSubjects = []) {
        return normalizeSubjects(rawSubjects)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => ({ ...s, classAverage: classAvgMap[s.name] ?? 0 }));
    }

    function scoreBand(score) {
        const m = Number(score ?? 0);
        if (m >= 45 && m <= 50) return "Outstanding";
        if (m >= 35 && m <= 44) return "High";
        if (m >= 30 && m <= 34) return "Good";
        if (m >= 20 && m <= 29) return "Aspiring";
        return "Basic";
    }

    function bandBadgeClass(band) {
        switch (band) {
            case "Outstanding":
                return "bg-blue-600 text-white";
            case "High":
                return "bg-blue-500 text-white";
            case "Good":
                return "bg-sky-400 text-black";
            case "Aspiring":
                return "bg-amber-400 text-black";
            default:
                return "bg-red-400 text-white";
        }
    }

    // returns dataURL for an image src
    const getImageDataURL = (src) =>
        new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                const c = document.createElement("canvas");
                c.width = img.width;
                c.height = img.height;
                c.getContext("2d").drawImage(img, 0, 0);
                resolve(c.toDataURL("image/png"));
            };
            img.onerror = reject;
            img.src = src;
        });

    // generate QR onto a canvas then add to pdf at given coords.
    // we generate a large canvas (512px) so the QR stays crisp when scaled to PDF
    const generateQRCode = (pdf, value, x, y, size = 88) =>
        new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            QRCode.toCanvas(canvas, value, { width: 512 }, (err) => {
                if (err) {
                    console.warn("QR generation failed", err);
                    return resolve();
                }
                try {
                    const dataUrl = canvas.toDataURL("image/png");
                    // add QR image to PDF at the requested coordinates and size
                    pdf.addImage(dataUrl, "PNG", x, y, size, size);
                } catch (e) {
                    console.warn("Failed to add QR to PDF", e);
                }
                resolve();
            });
        });

    // use red for PDF accents (Tailwind red-600-ish)
    const PDF_RED = [220, 38, 38];

    async function generateTableAndComments(pdf, student, startY) {
        const subjects = getSubjectsWithClassAvg(student.subjects || []);
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const MARGIN = 36; // pt
        const contentWidth = pageW - MARGIN * 2;

        // header block (left) and right box for logo (QR removed from right box)
        const headerX = MARGIN;
        const headerY = startY;
        const headerLineSpacing = 16;
        const headerBlockHeight = headerLineSpacing * 4 + 12; // more padding
        const rightBoxWidth = 180; // space reserved for logo
        const rightBoxX = pageW - MARGIN - rightBoxWidth;
        const rightBoxCenterX = rightBoxX + rightBoxWidth / 2;

        // label/value alignment
        const labelX = headerX;
        const valueX = headerX + 120; // consistent offset for values

        // Student name wraps if long
        pdf.setFont("helvetica", "bold").setFontSize(12);
        pdf.setTextColor(0, 0, 0);
        const nameLines = pdf.splitTextToSize(String(student.name || "—"), contentWidth * 0.6);
        pdf.text("STUDENT NAME:", labelX, headerY);
        pdf.setFont("helvetica", "normal").setFontSize(12);
        pdf.setTextColor(0, 0, 0);
        pdf.text(nameLines, valueX, headerY);

        // CLASS
        pdf.setFont("helvetica", "bold").setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        pdf.text("CLASS:", labelX, headerY + headerLineSpacing);
        pdf.setFont("helvetica", "normal").setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        pdf.text(String(student.className || "—"), valueX, headerY + headerLineSpacing);

        // TERM ENDING
        pdf.setFont("helvetica", "bold").setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        pdf.text("TERM ENDING:", labelX, headerY + headerLineSpacing * 2);
        pdf.setFont("helvetica", "normal").setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        pdf.text(String(student.termEnding || student.examPeriod || "—"), valueX, headerY + headerLineSpacing * 2);

        // ATTENDANCE
        pdf.setFont("helvetica", "bold").setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        pdf.text("ATTENDANCE:", labelX, headerY + headerLineSpacing * 3);
        pdf.setFont("helvetica", "normal").setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        const attText = student.attendanceDays ?? (typeof student.attendancePercentage === "number" ? `${student.attendancePercentage}%` : "—");
        pdf.text(String(attText), valueX, headerY + headerLineSpacing * 3);

        // Red divider under header
        pdf.setDrawColor(...PDF_RED);
        pdf.setLineWidth(1.2);
        pdf.line(MARGIN, headerY + headerBlockHeight, pageW - MARGIN, headerY + headerBlockHeight);

        // Right box: big logo only (QR code was moved to bottom-right)
        const logoTop = headerY - 4;
        const logoHeight = 56; // bigger logo
        try {
            if (student.schoolLogoUrl) {
                const logoData = await getImageDataURL(student.schoolLogoUrl);
                const logoW = Math.min(logoHeight * 2.5, rightBoxWidth - 12); // keep aspect but larger
                pdf.addImage(logoData, "PNG", rightBoxCenterX - logoW / 2, logoTop, logoW, logoHeight);
            }
        } catch {
            // ignore
        }

        // Compute table start (leave normal vertical space under header)
        let tableStartY = headerY + headerBlockHeight + 26;

        // Column widths sum to contentWidth
        // SUBJECT reduced, TEACHER'S COMMENT increased
        const subjectW = Math.round(contentWidth * 0.22); // reduced from 0.32/0.28 -> 0.22
        const markW = Math.round(contentWidth * 0.10);
        const classAvgW = Math.round(contentWidth * 0.14); // keeps full words intact
        const bandW = Math.round(contentWidth * 0.12);
        const commentW = contentWidth - (subjectW + markW + classAvgW + bandW); // larger remainder for comments

        // autoTable with header adjusted: use full words for the class-average header so they don't get split
        autoTable(pdf, {
            startY: tableStartY,
            head: [
                [
                    { content: "SUBJECT", styles: { halign: "left" } },
                    { content: "MARK\nOUT\nOF 50", styles: { halign: "center" } },
                    { content: "CLASS SUBJECT AVERAGE", styles: { halign: "center" } }, // full words
                    { content: "BAND", styles: { halign: "center" } },
                    { content: "TEACHER'S\nCOMMENT", styles: { halign: "left" } },
                ],
            ],
            // map subjects to columns that match new header order:
            // SUBJECT | MARK OUT OF 50 | CLASS SUBJECT AVERAGE | BAND | TEACHER'S COMMENT
            body: subjects.map((s) => [
                s.name,
                String(s.finalMark ?? ""),
                String(s.classAverage ?? ""),
                scoreBand(s.finalMark),
                s.subjectTeacherComment || "—",
            ]),
            styles: {
                fontSize: 10,
                cellPadding: 6,
                overflow: "linebreak",
                textColor: [0, 0, 0], // ensure dark black text in cells
            },
            theme: "grid",
            headStyles: { fillColor: PDF_RED, textColor: [255, 255, 255], fontStyle: "bold" },
            columnStyles: {
                0: { cellWidth: subjectW, halign: "left" },
                1: { cellWidth: markW, halign: "center" },
                2: { cellWidth: classAvgW, halign: "center" },
                3: { cellWidth: bandW, halign: "center" },
                4: { cellWidth: commentW, halign: "left" },
            },
            didDrawCell: (data) => {
                // optional per-cell styling can be added here
            },
        });

        // after table
        let y = pdf.lastAutoTable.finalY + 16;

        // page overflow check
        const estimateNeeded = 220; // increased because of larger logo & extra spacing
        if (y + estimateNeeded > pageH - MARGIN) {
            pdf.addPage();
            y = MARGIN;
        }

        // Total Points (right aligned)
        const totalPoints = (student.subjects || []).reduce((s, sub) => s + (Number(sub.finalMark || 0)), 0);
        pdf.setFont("helvetica", "bold").setFontSize(11);
        pdf.setTextColor(0, 0, 0);
        const totalText = `Total Points: ${totalPoints}`;
        const totalTextWidth = pdf.getTextWidth(totalText);
        pdf.text(totalText, pageW - MARGIN - totalTextWidth, y);
        y += 22;

        // Class teacher comment with extra spacing & indentation (as requested)
        pdf.setFont("helvetica", "bold").setFontSize(11);
        pdf.setTextColor(...PDF_RED);
        pdf.text("Class teacher’s comment:", MARGIN, y);
        pdf.setFont("helvetica", "normal").setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        const ctText = student.classTeacherComment || "—";
        const ctLines = pdf.splitTextToSize(ctText, contentWidth - 24);
        // indent comment lines and add an empty line above and below as spacing
        pdf.text(" ", MARGIN, y + 8); // extra space
        pdf.text(ctLines.map((l) => "  " + l), MARGIN + 12, y + 14);
        y += ctLines.length * 7 + 22; // increased spacing

        // School head's remarks with spacing and indentation
        pdf.setFont("helvetica", "bold").setFontSize(11);
        pdf.setTextColor(...PDF_RED);
        pdf.text("School head’s remarks:", MARGIN, y);
        pdf.setFont("helvetica", "normal").setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        const headText = student.schoolHeadRemarks || "—";
        const headLines = pdf.splitTextToSize(headText, contentWidth - 24);
        pdf.text(" ", MARGIN, y + 8); // extra space
        pdf.text(headLines.map((l) => "  " + l), MARGIN + 12, y + 14);
        y += headLines.length * 7 + 22;

        // performance bands small table
        if (y + 120 > pageH - MARGIN) {
            pdf.addPage();
            y = MARGIN;
        }
        autoTable(pdf, {
            startY: y,
            head: [["Score", "Band"]],
            body: [
                ["45-50", "Outstanding"],
                ["35-44", "High"],
                ["30-34", "Good"],
                ["20-29", "Aspiring"],
                ["0-19", "Basic"],
            ],
            styles: { fontSize: 10, cellPadding: 6, textColor: [0, 0, 0] },
            theme: "grid",
            headStyles: { fillColor: PDF_RED, textColor: [255, 255, 255], fontStyle: "bold" },
            columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: contentWidth - 80 } },
        });
    }

    async function generatePDFContent(pdf, student) {
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        // title centered (use red)
        pdf.setFont("helvetica", "bold").setFontSize(14);
        pdf.setTextColor(...PDF_RED);
        pdf.text(student.schoolName || "RIVERSIDE SCHOOL", pageW / 2, 30, { align: "center" });
        // thin red divider under title
        pdf.setDrawColor(...PDF_RED);
        pdf.setLineWidth(1.2);
        const titleDividerY = 36;
        pdf.line(36, titleDividerY, pageW - 36, titleDividerY);

        // Place QR at bottom-right corner of the first page
        const MARGIN = 36;
        const qrSize = 96;
        const qrX = pageW - MARGIN - qrSize;
        const qrY = pageH - MARGIN - qrSize;
        const qrValue = `https://example.com/student/${student.regNumber}`;
        await generateQRCode(pdf, qrValue, qrX, qrY, qrSize);

        // header start (same value passed to generateTableAndComments below)
        const headerStartY = 64;
        await generateTableAndComments(pdf, student, headerStartY);
    }

    async function downloadPDF(student) {
        const pdf = new jsPDF({ unit: "pt", format: "a4" });
        // Do NOT add QR here; QR is added in generatePDFContent (bottom-right)
        try {
            if (student.schoolLogoUrl) {
                // place a larger logo top-left as a small visual (commented out — optional)
                const logo = await getImageDataURL(student.schoolLogoUrl);
                // pdf.addImage(logo, "PNG", 36, 10, 120, 40);
            }
        } catch {
            // ignore logo error
        }
        await generatePDFContent(pdf, student);
        return pdf;
    }

    // --- fetch / download all / UI (table header updated) ---------------------
    async function downloadAllClass() {
        setLoading(true);
        try {
            const res = await fetch("/api/all-reports");
            if (!res.ok) throw new Error();
            const allReports = await res.json();
            const byClass = groupBy(allReports, (r) => r.className);
            const zip = new JSZip();
            for (const [cls, students] of Object.entries(byClass)) {
                const folder = zip.folder(cls);
                await Promise.all(
                    students.map(async (student) => {
                        const pdf = await downloadPDF(student);
                        const blob = pdf.output("blob");
                        folder.file(`${student.name}-report.pdf`, blob);
                    })
                );
            }
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, `all-reports-${Date.now()}.zip`);
            toast.success("All PDFs downloaded for every class!");
        } catch (err) {
            console.error(err);
            toast.error("Failed to generate ZIP");
        }
        setLoading(false);
    }

    async function fetchReports(className) {
        setLoading(true);
        setSelectedClass(className);
        try {
            let url = "/api/all-reports";
            if (className) url += `?className=${encodeURIComponent(className)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error();
            const data = await res.json();
            if (!className) {
                const classes = Array.from(new Set(data.map((r) => r.className)));
                setClassList(classes);
                if (classes.length) {
                    await fetchReports(classes[0]);
                    return;
                }
            } else {
                setReports(data);
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to load reports");
        }
        setLoading(false);
    }

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

    // UI: update table header to use multi-line labels (using <br/>)
    return (
        <div className="p-6 bg-slate-900 min-h-screen text-white">
            <h1 className="text-3xl mb-4 text-red-300">Admin: Reports</h1>

            <div className="flex gap-2 mb-6 flex-wrap items-center">
                {classList.map((cls) => (
                    <button
                        key={cls}
                        onClick={() => fetchReports(cls)}
                        className={`px-3 py-1 rounded ${selectedClass === cls ? "bg-red-600 hover:bg-red-500" : "bg-slate-700 hover:bg-slate-600"}`}
                    >
                        {cls}
                    </button>
                ))}
                <button onClick={downloadAllClass} disabled={loading} className="ml-auto bg-red-600 px-4 py-2 rounded disabled:opacity-50">
                    {loading ? "Processing…" : "Download All PDFs"}
                </button>
            </div>

            {loading ? (
                <p>Loading reports…</p>
            ) : !reports.length ? (
                <p>No reports found for this class.</p>
            ) : (
                reports.map((report) => {
                    const subjects = getSubjectsWithClassAvg(report.subjects || []);
                    return (
                        <div key={report.regNumber} className="mb-8 bg-slate-800 p-4 rounded">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl">{report.name}</h2>
                                    <p className="text-sm text-slate-400">{report.className ?? ""} — {report.termEnding ?? report.examPeriod}</p>
                                    <p className="text-sm text-slate-400">{report.attendanceDays ?? `${report.attendancePercentage}% attendance`}</p>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <button
                                        onClick={async () => {
                                            const pdf = await downloadPDF(report);
                                            pdf.save(`${report.name}-report.pdf`);
                                            toast.success("PDF generated successfully!");
                                        }}
                                        className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded"
                                    >
                                        Download PDF
                                    </button>
                                </div>
                            </div>

                            <div className="h-64 mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart
                                        data={subjects.map((s) => ({
                                            subject: s.name.substring(0, 12),
                                            Student: s.finalMark,
                                            Class: s.classAverage,
                                        }))}
                                    >
                                        <PolarGrid />
                                        <PolarAngleAxis dataKey="subject" />
                                        <PolarRadiusAxis domain={[0, 50]} />
                                        <Radar name="Student" dataKey="Student" stroke="#b91c1c" fill="#b91c1c" fillOpacity={0.45} />
                                        <Radar name="Class" dataKey="Class" stroke="#fca5a5" fill="#fca5a5" fillOpacity={0.25} />
                                        <Legend />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>

                            <table className="w-full text-sm mt-4">
                                <thead>
                                    <tr className="bg-slate-700 text-left">
                                        <th className="p-2">Subject</th>
                                        <th className="p-2 text-center">
                                            MARK<br />
                                            OUT<br />
                                            OF 50
                                        </th>
                                        <th className="p-2 text-center">
                                            CLASS<br />
                                            SUBJECT<br />
                                            AVERAGE
                                        </th>
                                        <th className="p-2">Band</th>
                                        <th className="p-2">Teacher Comment</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subjects.map((s, i) => (
                                        <tr key={i} className={i % 2 ? "bg-slate-800" : ""}>
                                            <td className="p-2">{s.name}</td>
                                            <td className="p-2 text-center">{s.finalMark}</td>
                                            <td className="p-2 text-center">{s.classAverage}</td>
                                            <td className="p-2">
                                                <span className={`px-2 py-0.5 rounded text-xs ${bandBadgeClass(scoreBand(s.finalMark))}`}>
                                                    {scoreBand(s.finalMark)}
                                                </span>
                                            </td>
                                            <td className="p-2">{s.subjectTeacherComment}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="mt-4 p-3 bg-slate-700 rounded text-white">
                                <strong>Class Teacher Comment:</strong> {report.classTeacherComment || "—"}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}
