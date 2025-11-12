// /src/app/admin/reports/download-excel/page.jsx
"use client";
import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function DownloadExcelPage() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const res = await fetch("/api/all-reports");
                if (!res.ok) throw new Error("Failed to load reports");
                const data = await res.json();
                setReports(data || []);
            } catch (err) {
                console.error(err);
                setReports([]);
            }
            setLoading(false);
        })();
    }, []);

    function sanitizeSheetName(name = "Sheet") {
        // Excel sheet names max 31 chars and cannot contain: : \ / ? * [ ]
        return String(name).replace(/[:\\\/\?\*\[\]]/g, " ").slice(0, 31);
    }

    function buildWorkbookFromReports(allReports) {
        // Build class -> student -> subject -> finalMark map
        const classMap = {}; // { className: { studentKey: { studentName, subjects: { subjName: mark } } } }

        allReports.forEach((r) => {
            const cls = r.className || "Unknown";
            classMap[cls] ||= {};
            // choose a stable key: prefer regNumber, fallback to name
            const studentKey = r.regNumber || r.name || Math.random().toString(36).slice(2, 9);
            classMap[cls][studentKey] ||= { studentName: r.name || studentKey, subjects: {} };

            if (Array.isArray(r.subjects)) {
                r.subjects.forEach((s) => {
                    // Follow same convention as your existing code: exclude non-attempts (finalMark === 0)
                    if (!s || typeof s.finalMark !== "number" || s.finalMark === 0) return;
                    // assign the final mark for the subject (if multiple entries for same subj per student, last wins)
                    classMap[cls][studentKey].subjects[s.name] = s.finalMark;
                });
            }
        });

        const wb = XLSX.utils.book_new();

        // For each class create a sheet
        Object.entries(classMap).forEach(([cls, studentsObj]) => {
            // gather all subject names in this class (to create consistent columns)
            const subjSet = new Set();
            Object.values(studentsObj).forEach((st) => {
                Object.keys(st.subjects).forEach((sn) => subjSet.add(sn));
            });
            const subjectNames = Array.from(subjSet).sort((a, b) => a.localeCompare(b));

            // header
            const header = ["StudentName", ...subjectNames, "Total FinalMark", "AverageFinalMark"];

            // build rows
            const rows = Object.values(studentsObj).map((st) => {
                const row = [];
                row.push(st.studentName);
                let total = 0;
                let count = 0;
                subjectNames.forEach((subj) => {
                    const val = st.subjects.hasOwnProperty(subj) ? st.subjects[subj] : "";
                    if (typeof val === "number") {
                        total += val;
                        count += 1;
                    }
                    row.push(val);
                });
                const avg = count ? Math.round((total / count) * 100) / 100 : "";
                row.push(total);
                row.push(avg);
                return { studentName: st.studentName, total, row };
            });

            // sort rows by total descending
            rows.sort((a, b) => b.total - a.total);

            // create 2D array for sheet: header + row arrays
            const aoa = [header, ...rows.map((r) => r.row)];

            const ws = XLSX.utils.aoa_to_sheet(aoa);
            const safeName = sanitizeSheetName(cls);
            XLSX.utils.book_append_sheet(wb, ws, safeName);
        });

        return wb;
    }

    async function handleDownloadExcel() {
        if (!reports || !reports.length) {
            alert("No report data available to export.");
            return;
        }
        setGenerating(true);
        try {
            const wb = buildWorkbookFromReports(reports);
            const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
            const blob = new Blob([wbout], { type: "application/octet-stream" });
            saveAs(blob, `subject-totals-by-class-${Date.now()}.xlsx`);
        } catch (err) {
            console.error("Failed to build workbook", err);
            alert("Failed to generate Excel. See console for details.");
        } finally {
            setGenerating(false);
        }
    }

    return (
        <div className="p-6">
            <h1 className="text-2xl mb-4">Download Subject / Total Excel</h1>
            <p className="mb-4 text-sm text-slate-500">
                One sheet per class. Columns: StudentName, [Subjects...], Total FinalMark, AverageFinalMark.
            </p>

            {loading ? (
                <p>Loading reports…</p>
            ) : (
                <div>
                    <button
                        onClick={handleDownloadExcel}
                        disabled={generating || !reports.length}
                        className="px-4 py-2 bg-blue-600 text-white rounded"
                    >
                        {generating ? "Generating…" : "Download Excel (one sheet per class)"}
                    </button>

                    <div className="mt-4 text-sm">
                        <strong>Classes found:</strong> {Array.from(new Set(reports.map(r => r.className))).join(", ") || "—"}
                        <br />
                        <strong>Students included:</strong> {reports.length}
                    </div>
                </div>
            )}
        </div>
    );
}
