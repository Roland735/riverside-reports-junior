// /src/app/admin/reports/anomaly/page.jsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import toast from "react-hot-toast";
import JSZip from "jszip";
import { saveAs } from "file-saver";

/* ---- numeric helpers ---- */
function mean(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function std(arr) {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) * (v - m), 0) / (arr.length - 1));
}
function median(arr) {
  if (!arr || !arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 0 ? (a[mid - 1] + a[mid]) / 2 : a[mid];
}
function quantile(arr, q) {
  if (!arr || !arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (a[base + 1] !== undefined) return a[base] + rest * (a[base + 1] - a[base]);
  return a[base];
}
function iqr(arr) {
  return quantile(arr, 0.75) - quantile(arr, 0.25);
}
function gradeFromMark(m) {
  if (m >= 90) return "A*";
  if (m >= 80) return "A";
  if (m >= 70) return "B";
  if (m >= 60) return "C";
  if (m >= 50) return "D";
  if (m >= 40) return "E";
  return "F";
}
const GRADE_ORDER = ["A*", "A", "B", "C", "D", "E", "F"];

// pass threshold (use finalMark to calculate pass rates)
const PASS_MARK = 50; // user requested 50%

/* Binary color helper: returns only red (fail) or green (pass)
   returns { fill: [r,g,b], text: [r,g,b] } */
function passFailColor(mark) {
  if (mark == null || mark === "") return { fill: [255, 255, 255], text: [0, 0, 0] };
  if (typeof mark !== "number") {
    const parsed = Number(mark);
    if (Number.isNaN(parsed)) return { fill: [255, 255, 255], text: [0, 0, 0] };
    mark = parsed;
  }
  if (mark >= PASS_MARK) {
    // green for pass (white text)
    return { fill: [34, 197, 94], text: [255, 255, 255] }; // green
  } else {
    // red for fail (white text)
    return { fill: [239, 68, 68], text: [255, 255, 255] }; // red
  }
}

// alias (some code expects colorForMark)
const colorForMark = passFailColor;

// PDF-specific binary colors (same)
function pdfPassFailColors(mark) {
  return passFailColor(mark);
}

export default function AnomalyReportsPage() {
  const [reports, setReports] = useState([]); // all student reports (all classes)
  const [classList, setClassList] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/all-reports");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setReports(data);
        const classes = Array.from(new Set(data.map((r) => r.className))).sort();
        setClassList(classes);
        if (classes.length) setSelectedClass(classes[0]);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load reports");
      }
      setLoading(false);
    })();
  }, []);

  // students for the selected class
  const reportsForClass = useMemo(
    () => reports.filter((r) => r.className === selectedClass),
    [reports, selectedClass]
  );

  /* -------------------------
     CLASS-LEVEL per-subject stats (exclude finalMark === 0)
     Components aggregated using subjectAllocId to keep papers distinct
     ------------------------- */
  const subjectStats = useMemo(() => {
    if (!reportsForClass.length) return [];
    const map = {};
    reportsForClass.forEach((r) => {
      r.subjects.forEach((s) => {
        if (!s || typeof s.finalMark !== "number" || s.finalMark === 0) return; // exclude not attempted
        map[s.name] ||= { name: s.name, values: [], componentsPool: {} };
        map[s.name].values.push(s.finalMark);
        if (Array.isArray(s.components)) {
          s.components.forEach((c) => {
            const compKey = `${String(c.subjectAllocId || "")}||${String(c.component)}`;
            map[s.name].componentsPool[compKey] ||= { arr: [], label: `${r.className} - Paper:${c.component}`, key: compKey };
            map[s.name].componentsPool[compKey].arr.push(c.percentage ?? 0);
          });
        }
      });
    });

    return Object.values(map)
      .map((entry) => {
        const vals = entry.values;
        const m = mean(vals);
        const sd = std(vals);
        const med = median(vals);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const q1 = quantile(vals, 0.25);
        const q3 = quantile(vals, 0.75);
        const theIqr = q3 - q1;
        const outliers = vals.filter(v => v < q1 - 1.5 * theIqr || v > q3 + 1.5 * theIqr).length;
        // use PASS_MARK for pass counting
        const passCount = vals.filter((v) => v >= PASS_MARK).length;
        const gradeCounts = GRADE_ORDER.reduce((acc, g) => ((acc[g] = 0), acc), {});
        vals.forEach((v) => gradeCounts[gradeFromMark(v)]++);
        const components = Object.entries(entry.componentsPool).map(([k, obj]) => {
          const arr = obj.arr || [];
          return {
            key: k,
            label: obj.label,
            mean: Math.round(mean(arr)),
            sd: Math.round(std(arr)),
            median: Math.round(median(arr)),
            zeros: arr.filter((v) => v === 0).length,
            count: arr.length,
            zeroRate: Math.round((arr.filter((v) => v === 0).length / Math.max(1, arr.length)) * 100)
          };
        }).sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key));
        return {
          name: entry.name,
          mean: Math.round(m),
          sd: Math.round(sd),
          median: Math.round(med),
          min,
          max,
          q1: Math.round(q1),
          q3: Math.round(q3),
          iqr: Math.round(theIqr),
          outliers,
          count: vals.length,
          passRate: Math.round((passCount / Math.max(1, vals.length)) * 100),
          gradeCounts,
          components,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [reportsForClass]);

  // overall grade distribution for the class (across all subject-student pairs)
  const overallGradeDistribution = useMemo(() => {
    const dist = GRADE_ORDER.reduce((acc, g) => ((acc[g] = 0), acc), {});
    if (!reportsForClass.length) return dist;
    reportsForClass.forEach((r) => {
      r.subjects.forEach((s) => {
        if (!s || typeof s.finalMark !== "number" || s.finalMark === 0) return;
        const g = gradeFromMark(s.finalMark);
        dist[g]++;
      });
    });
    return dist;
  }, [reportsForClass]);

  // class summary (top/bottom subjects)
  const classSummary = useMemo(() => {
    if (!subjectStats.length) return null;
    const sortedByMean = [...subjectStats].sort((a, b) => b.mean - a.mean);
    const top = sortedByMean.slice(0, 3);
    const bottom = sortedByMean.slice(-3).reverse();
    const avgMean = Math.round(mean(subjectStats.map((s) => s.mean)));
    const avgPassRate = Math.round(mean(subjectStats.map((s) => s.passRate)));
    return { top, bottom, avgMean, avgPassRate };
  }, [subjectStats]);

  /* STUDENT anomalies & improvement rules */
  const studentAnomalies = useMemo(() => {
    const threshold = 2.0;
    const anomalies = [];
    const needImprovement = [];
    if (!reportsForClass.length) return { anomalies, needImprovement };
    const statsMap = Object.fromEntries(subjectStats.map((s) => [s.name, s]));
    reportsForClass.forEach((student) => {
      student.subjects.forEach((s) => {
        if (!s || typeof s.finalMark !== "number" || s.finalMark === 0) return;
        const st = statsMap[s.name];
        if (st && st.sd > 0) {
          const z = (s.finalMark - st.mean) / st.sd;
          if (Math.abs(z) >= threshold) {
            anomalies.push({
              regNumber: student.regNumber,
              studentName: student.name,
              subject: s.name,
              finalMark: s.finalMark,
              classMean: st.mean,
              classSd: st.sd,
              z: Number(z.toFixed(2)),
              direction: z < 0 ? "Low" : "High",
            });
          }
        }
        const reasons = [];
        if (st && st.sd > 0 && s.finalMark < st.mean - st.sd) reasons.push("Below class mean by >1 SD");
        // main pass/fail threshold
        if (s.finalMark < PASS_MARK) reasons.push(`Below pass (${PASS_MARK}%)`);
        // keep the additional granular notes if you still want them
        if (s.finalMark < 50) reasons.push("Below 50 (D or lower)");
        if (s.finalMark < 40) reasons.push("Below 40 (Fail)");

        const componentAlerts = [];
        if (Array.isArray(s.components) && s.components.length) {
          const compMap = Object.fromEntries(s.components.map(c => [`${String(c.subjectAllocId || "")}||${String(c.component)}`, c.percentage]));
          if (st && Array.isArray(st.components)) {
            st.components.forEach((cstat) => {
              const val = compMap[cstat.key] ?? null;
              if (val == null) return;
              if (val < (cstat.mean - cstat.sd) || val < 40) {
                componentAlerts.push({ component: cstat.label || cstat.key, value: val, mean: cstat.mean, sd: cstat.sd });
              }
            });
          }
        }

        if (reasons.length || componentAlerts.length) {
          needImprovement.push({
            regNumber: student.regNumber,
            studentName: student.name,
            subject: s.name,
            finalMark: s.finalMark,
            reasons,
            componentAlerts,
          });
        }
      });
    });

    needImprovement.sort((a, b) => {
      // prioritise failing students (those below PASS_MARK)
      const scoreA = (a.finalMark < PASS_MARK ? 1000 : 0) + (a.reasons.length * 10) + a.finalMark;
      const scoreB = (b.finalMark < PASS_MARK ? 1000 : 0) + (b.reasons.length * 10) + b.finalMark;
      return scoreA - scoreB;
    });

    anomalies.sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
    return { anomalies, needImprovement };
  }, [reportsForClass, subjectStats]);

  /* GLOBAL subject stats across all classes (paper uniqueness kept via subjectAllocId) */
  const globalSubjectStats = useMemo(() => {
    if (!reports.length) return [];
    const map = {};
    reports.forEach((r) => {
      r.subjects.forEach((s) => {
        if (!s || typeof s.finalMark !== "number" || s.finalMark === 0) return;
        map[s.name] ||= { name: s.name, values: [], componentsPool: {}, studentRows: [] };
        map[s.name].values.push(s.finalMark);
        if (Array.isArray(s.components)) {
          s.components.forEach((c) => {
            const compKey = `${r.className}||${String(c.subjectAllocId || "")}||${String(c.component)}`;
            map[s.name].componentsPool[compKey] ||= { arr: [], label: `${r.className} - Paper:${c.component}`, meta: { className: r.className, subjectAllocId: c.subjectAllocId }, key: compKey };
            map[s.name].componentsPool[compKey].arr.push(c.percentage ?? 0);
          });
        }
        map[s.name].studentRows.push({
          className: r.className,
          studentName: r.name,
          finalMark: s.finalMark,
          components: s.components || []
        });
      });
    });

    return Object.values(map).map((entry) => {
      const vals = entry.values;
      const m = mean(vals);
      const sd = std(vals);
      const med = median(vals);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const q1 = quantile(vals, 0.25);
      const q3 = quantile(vals, 0.75);
      const theIqr = q3 - q1;
      const outliers = vals.filter(v => v < q1 - 1.5 * theIqr || v > q3 + 1.5 * theIqr).length;
      // use PASS_MARK for global pass counting
      const passCount = vals.filter((v) => v >= PASS_MARK).length;
      const gradeCounts = GRADE_ORDER.reduce((acc, g) => ((acc[g] = 0), acc), {});
      vals.forEach((v) => gradeCounts[gradeFromMark(v)]++);

      const components = Object.entries(entry.componentsPool).map(([key, obj]) => {
        const arr = obj.arr || [];
        return {
          key,
          label: obj.label,
          meta: obj.meta || {},
          mean: Math.round(mean(arr)),
          sd: Math.round(std(arr)),
          median: Math.round(median(arr)),
          zeros: arr.filter((v) => v === 0).length,
          count: arr.length,
          zeroRate: Math.round((arr.filter((v) => v === 0).length / Math.max(1, arr.length)) * 100)
        };
      }).sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key));

      return {
        name: entry.name,
        mean: Math.round(m),
        sd: Math.round(sd),
        median: Math.round(med),
        min,
        max,
        q1: Math.round(q1),
        q3: Math.round(q3),
        iqr: Math.round(theIqr),
        outliers,
        count: vals.length,
        passRate: Math.round((passCount / Math.max(1, vals.length)) * 100),
        gradeCounts,
        components,
        studentRows: entry.studentRows
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [reports]);

  /* ----------------------------
     PDF generation helpers
     ---------------------------- */

  // --- (1) SUBJECTS: create single combined PDF (previously created separate PDFs & zip) ---
  // Now: each subject starts on a fresh page
  async function downloadSubjectPDFsAcrossClasses() {
    if (!globalSubjectStats.length) return toast.error("No subject data available");
    setLoading(true);
    try {
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      let y = 40;
      const pageHeight = pdf.internal.pageSize.height;

      for (let subjIndex = 0; subjIndex < globalSubjectStats.length; subjIndex++) {
        const subj = globalSubjectStats[subjIndex];

        // Ensure each subject starts on a fresh page
        if (subjIndex === 0) {
          // first subject: keep on first page, reset y
          y = 40;
        } else {
          pdf.addPage();
          y = 40;
        }

        // Subject title + overall pass rate
        pdf.setFontSize(16).text(`${subj.name} — Pass Rate: ${subj.passRate}%`, 40, y);
        y += 18;

        // Determine classes present for this subject
        const classes = Array.from(new Set(subj.studentRows.map(r => r.className))).sort();

        // Build paper keys and labels (global)
        const paperKeys = subj.components.map(c => c.key);
        const paperLabels = subj.components.map(c => c.label);

        // If there are no paper-level columns, print a single table (Class | Student | Final)
        if (!paperKeys.length) {
          const head = [["Class", "Student", "Final"]];
          const rows = subj.studentRows.map(r => [r.className, r.studentName, r.finalMark]);

          // compute pass rate for this subject across all rows (table)
          const passCountGlobal = rows.filter(rr => typeof rr[2] === "number" ? rr[2] >= PASS_MARK : Number(rr[2]) >= PASS_MARK).length;
          const passRateGlobal = Math.round((passCountGlobal / Math.max(1, rows.length)) * 100);
          pdf.setFontSize(10).text(`Pass Rate (table): ${passRateGlobal}%`, 40, y);
          y += 12;

          autoTable(pdf, {
            startY: y,
            head,
            body: rows,
            styles: { fontSize: 10, cellPadding: 6 },
            theme: "grid",
            headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
            didParseCell: function (data) {
              if (data.section === "head") return;
              const colIdx = data.column.index;
              // final column index is 2
              if (colIdx === 2) {
                const parsed = data.cell.raw;
                const colColors = pdfPassFailColors(parsed);
                data.cell.styles.fillColor = colColors.fill;
                data.cell.styles.textColor = colColors.text;
              } else {
                data.cell.styles.fillColor = [255, 255, 255];
                data.cell.styles.textColor = [0, 0, 0];
              }
            }
          });
          y = pdf.lastAutoTable.finalY + 16; // extra spacing after table
        } else {
          // There are paper-level columns: group rows by class for readability
          for (const clsName of classes) {
            const classPaperKeys = subj.components
              .filter(c => (c.meta && c.meta.className) === clsName)
              .map(c => c.key);

            const thisPaperKeys = classPaperKeys.length ? classPaperKeys : paperKeys;
            const thisPaperLabels = subj.components
              .filter(c => thisPaperKeys.includes(c.key))
              .map(c => c.label);

            const head = [["Class", "Student", ...thisPaperLabels, "Final"]];

            const rows = subj.studentRows
              .filter(r => r.className === clsName)
              .map(r => {
                const compMap = {};
                if (Array.isArray(r.components)) {
                  r.components.forEach((c) => {
                    const key = `${r.className}||${String(c.subjectAllocId || "")}||${String(c.component)}`;
                    compMap[key] = c.percentage;
                  });
                }
                const paperVals = thisPaperKeys.map(pk => (compMap[pk] != null ? compMap[pk] : ""));
                return [clsName, r.studentName, ...paperVals, r.finalMark];
              });

            // compute pass rate for this class table
            const passCountClass = rows.filter(rr => {
              const val = rr[rr.length - 1];
              return typeof val === "number" ? val >= PASS_MARK : Number(val) >= PASS_MARK;
            }).length;
            const classPassRate = Math.round((passCountClass / Math.max(1, rows.length)) * 100);

            if (y > pageHeight - 160) { pdf.addPage(); y = 40; }

            pdf.setFontSize(12).text(`${subj.name} — ${clsName}`, 40, y);
            y += 12;
            pdf.setFontSize(10).text(`Pass Rate (table): ${classPassRate}%`, 40, y);
            y += 8;

            autoTable(pdf, {
              startY: y,
              head,
              body: rows,
              styles: { fontSize: 9, cellPadding: 6 },
              theme: "grid",
              didParseCell: function (data) {
                if (data.section === "head") {
                  data.cell.styles.fillColor = [40, 40, 40];
                  data.cell.styles.textColor = [255, 255, 255];
                  return;
                }
                const colIdx = data.column.index;
                const papersStart = 2;
                const finalIdx = 2 + thisPaperKeys.length;
                if (colIdx >= papersStart && colIdx < finalIdx) {
                  const rawVal = data.cell.raw;
                  const parsed = typeof rawVal === "number" ? rawVal : rawVal === "" ? null : Number(rawVal);
                  const colColors = passFailColor(parsed);
                  data.cell.styles.fillColor = colColors.fill;
                  data.cell.styles.textColor = colColors.text;
                } else if (colIdx === finalIdx) {
                  const parsed = data.cell.raw;
                  const colColors = pdfPassFailColors(parsed);
                  data.cell.styles.fillColor = colColors.fill;
                  data.cell.styles.textColor = colColors.text;
                } else {
                  data.cell.styles.fillColor = [255, 255, 255];
                  data.cell.styles.textColor = [0, 0, 0];
                }
              },
              headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
              columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 140 } }
            });

            y = pdf.lastAutoTable.finalY + 16; // extra spacing between class tables
            if (y > pageHeight - 160) { pdf.addPage(); y = 40; }
          }
        }

        // Small spacer at end of subject block
        if (y > pageHeight - 120) { pdf.addPage(); y = 40; }
        else { y += 8; }
      }

      // Save one combined PDF with all subjects (each subject on its own page)
      pdf.save(`subjects-all-in-one-${Date.now()}.pdf`);
      toast.success("Subjects combined into single PDF downloaded (each subject on its own page)");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate subject PDF");
    }
    setLoading(false);
  }

  // --- (2) Existing Class PDFs (per-class files zipped) ---
  async function downloadClassPDFsAcrossSubjects() {
    if (!classList.length) return toast.error("No classes available");
    setLoading(true);
    try {
      const zip = new JSZip();
      for (const cls of classList) {
        const studentsInClass = reports.filter(r => r.className === cls);
        if (!studentsInClass.length) continue;

        // Build subject-level entries for this class (exclude finalMark === 0)
        const subjectMap = {};
        studentsInClass.forEach((r) => {
          r.subjects.forEach((s) => {
            if (!s || typeof s.finalMark !== "number" || s.finalMark === 0) return;
            subjectMap[s.name] ||= { name: s.name, values: [], componentsPool: {}, rows: [] };
            subjectMap[s.name].values.push(s.finalMark);
            if (Array.isArray(s.components)) {
              s.components.forEach((c) => {
                const key = `${String(c.subjectAllocId || "")}||${String(c.component)}`;
                subjectMap[s.name].componentsPool[key] ||= { arr: [], label: `${cls} - Paper:${c.component}`, key };
                subjectMap[s.name].componentsPool[key].arr.push(c.percentage ?? 0);
              });
            }
            subjectMap[s.name].rows.push({ studentName: r.name, finalMark: s.finalMark, components: s.components || [] });
          });
        });

        const subjectEntries = Object.values(subjectMap).map(entry => {
          const vals = entry.values;
          const m = mean(vals);
          const sd = std(vals);
          const med = median(vals);
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const q1 = quantile(vals, 0.25);
          const q3 = quantile(vals, 0.75);
          const theIqr = q3 - q1;
          const outliers = vals.filter(v => v < q1 - 1.5 * theIqr || v > q3 + 1.5 * theIqr).length;
          // use PASS_MARK for pass counting
          const passCount = vals.filter((v) => v >= PASS_MARK).length;
          const gradeCounts = GRADE_ORDER.reduce((acc, g) => ((acc[g] = 0), acc), {});
          vals.forEach(v => gradeCounts[gradeFromMark(v)]++);
          const components = Object.entries(entry.componentsPool).map(([k, obj]) => {
            const arr = obj.arr || [];
            return {
              key: k,
              label: obj.label,
              mean: Math.round(mean(arr)),
              sd: Math.round(std(arr)),
              median: Math.round(median(arr)),
              zeros: arr.filter((v) => v === 0).length,
              count: arr.length,
              zeroRate: Math.round((arr.filter((v) => v === 0).length / Math.max(1, arr.length)) * 100)
            };
          }).sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key));
          return { name: entry.name, mean: Math.round(m), sd: Math.round(sd), median: Math.round(med), min, max, q1: Math.round(q1), q3: Math.round(q3), iqr: Math.round(theIqr), outliers, count: vals.length, passRate: Math.round((passCount / Math.max(1, vals.length)) * 100), gradeCounts, components, rows: entry.rows };
        }).sort((a, b) => a.name.localeCompare(b.name));

        // create pdf for class
        const pdf = new jsPDF({ unit: "pt", format: "a4" });
        let y = 40;
        pdf.setFontSize(16).text(`Class Analysis — ${cls} (All Subjects)`, 40, y);
        y += 20;
        pdf.setFontSize(11).text(`Students: ${studentsInClass.length}  |  Subjects analysed: ${subjectEntries.length}`, 40, y);
        y += 12;

        // summary table of subjects
        autoTable(pdf, {
          startY: y,
          head: [["Subject", "Count", "Mean", "Median", "SD", "Pass %", "A*", "A", "B", "C", "D", "E", "F"]],
          body: subjectEntries.map(s => [s.name, s.count, s.mean, s.median, s.sd, `${s.passRate}%`, s.gradeCounts['A*'] || 0, s.gradeCounts['A'] || 0, s.gradeCounts['B'] || 0, s.gradeCounts['C'] || 0, s.gradeCounts['D'] || 0, s.gradeCounts['E'] || 0, s.gradeCounts['F'] || 0]),
          styles: { fontSize: 8 },
          theme: "grid"
        });
        y = pdf.lastAutoTable.finalY + 10;

        // per-subject detailed table with paper columns
        for (const subj of subjectEntries) {
          pdf.setFontSize(12).text(`${subj.name} — summary`, 40, y);
          y += 12;
          pdf.setFontSize(10).text(`Mean: ${subj.mean}  Median: ${subj.median}  SD: ${subj.sd}  Pass: ${subj.passRate}%  Count: ${subj.count}`, 40, y);
          y += 8;

          // show pass rate for this subject table explicitly (user requested per-table pass rate)
          pdf.setFontSize(10).text(`Pass Rate (table): ${subj.passRate}%`, 40, y);
          y += 10;

          if (subj.components && subj.components.length) {
            // build paperKeys and header
            const paperKeys = subj.components.map(c => c.key);
            const head = [["Student", ...subj.components.map(c => c.label), "Final"]];
            const body = subj.rows.map(row => {
              const compMap = {};
              row.components.forEach(c => {
                const key = `${String(c.subjectAllocId || "")}||${String(c.component)}`;
                compMap[key] = c.percentage;
              });
              const paperVals = paperKeys.map(pk => (compMap[pk] != null ? compMap[pk] : ""));
              return [row.studentName, ...paperVals, row.finalMark];
            });

            // create paper stats map for highlighting (not used for color now)
            const paperStats = Object.fromEntries(subj.components.map(c => [c.key, { mean: c.mean, sd: c.sd }]));

            autoTable(pdf, {
              startY: y,
              head: head,
              body: body,
              styles: { fontSize: 9, cellPadding: 4 },
              theme: "grid",
              didParseCell: function (data) {
                if (data.section === "head") {
                  data.cell.styles.fillColor = [40, 40, 40];
                  data.cell.styles.textColor = [255, 255, 255];
                  return;
                }
                const colIdx = data.column.index;
                const papersStart = 1;
                const papersEnd = 1 + paperKeys.length - 1;
                const finalIdx = 1 + paperKeys.length;
                if (colIdx >= papersStart && colIdx <= papersEnd) {
                  // paper cell: binary pass/fail color
                  const rawVal = data.cell.raw;
                  const parsed = typeof rawVal === "number" ? rawVal : rawVal === "" ? null : Number(rawVal);
                  const colColors = passFailColor(parsed);
                  data.cell.styles.fillColor = colColors.fill;
                  data.cell.styles.textColor = colColors.text;
                } else if (colIdx === finalIdx) {
                  const parsed = data.cell.raw;
                  const colColors = pdfPassFailColors(parsed); // binary coloring
                  data.cell.styles.fillColor = colColors.fill;
                  data.cell.styles.textColor = colColors.text;
                } else {
                  data.cell.styles.fillColor = [255, 255, 255];
                  data.cell.styles.textColor = [0, 0, 0];
                }
              },
              columnStyles: {
                0: { cellWidth: 120 }
              }
            });

            y = pdf.lastAutoTable.finalY + 10;
          } else {
            // paperless per-subject table (simple Student | Final)
            const head = [["Student", "Final"]];
            const body = subj.rows.map(r => [r.studentName, r.finalMark]);
            autoTable(pdf, {
              startY: y,
              head,
              body,
              styles: { fontSize: 9 },
              theme: "grid",
              didParseCell: function (data) {
                if (data.section === "head") return;
                const colIdx = data.column.index;
                if (colIdx === 1) {
                  const parsed = data.cell.raw;
                  const colColors = pdfPassFailColors(parsed);
                  data.cell.styles.fillColor = colColors.fill;
                  data.cell.styles.textColor = colColors.text;
                }
              }
            });
            y = pdf.lastAutoTable.finalY + 10;
          }

          // Top/bottom students (quick)
          const sorted = [...subj.rows].sort((a, b) => b.finalMark - a.finalMark);
          const top = sorted.slice(0, 3);
          const bottom = sorted.slice(-3).reverse();
          autoTable(pdf, {
            startY: y,
            head: [["Top students", "Mark", "", "Bottom students", "Mark", ""]],
            body: Array.from({ length: Math.max(top.length, bottom.length) }).map((_, i) => [
              top[i] ? top[i].studentName : '', top[i] ? top[i].finalMark : '', '', bottom[i] ? bottom[i].studentName : '', bottom[i] ? bottom[i].finalMark : '', ''
            ]),
            styles: { fontSize: 9 },
            theme: "grid",
            columnStyles: { 2: { cellWidth: 10 }, 5: { cellWidth: 10 } }
          });
          y = pdf.lastAutoTable.finalY + 12;

          if (y > pdf.internal.pageSize.height - 120) { pdf.addPage(); y = 40; }
        }

        const blob = pdf.output("blob");
        zip.file(`class_${cls.replace(/\s+/g, '_')}.pdf`, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `classes-all-subjects-${Date.now()}.zip`);
      toast.success("Class PDFs (all subjects) downloaded");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate class PDFs");
    }
    setLoading(false);
  }

  // --- (3) Combined: Subjects & Classes in single ZIP (unchanged) ---
  async function downloadCombinedSubjectAndClassPDFs() {
    if (!globalSubjectStats.length || !classList.length) return toast.error("No data available to generate combined PDF package");
    setLoading(true);
    try {
      const zip = new JSZip();

      // PART A: add subject PDFs (individual subject files)
      for (const subj of globalSubjectStats) {
        const pdf = new jsPDF({ unit: "pt", format: "a4" });
        let y = 40;
        pdf.setFontSize(16).text(`${subj.name} — Pass Rate - ${subj.passRate}%`, 40, y);
        y += 18;

        const classes = Array.from(new Set(subj.studentRows.map(r => r.className))).sort();
        const paperKeys = subj.components.map(c => c.key);

        if (!paperKeys.length) {
          const head = [["Class", "Student", "Final"]];
          const rows = subj.studentRows.map(r => [r.className, r.studentName, r.finalMark]);
          const passCountGlobal = rows.filter(rr => typeof rr[2] === "number" ? rr[2] >= PASS_MARK : Number(rr[2]) >= PASS_MARK).length;
          const passRateGlobal = Math.round((passCountGlobal / Math.max(1, rows.length)) * 100);
          pdf.setFontSize(10).text(`Pass Rate (table): ${passRateGlobal}%`, 40, y);
          y += 12;

          autoTable(pdf, {
            startY: y,
            head,
            body: rows,
            styles: { fontSize: 10 },
            theme: "grid",
            headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
            didParseCell: function (data) {
              if (data.section === "head") return;
              const colIdx = data.column.index;
              if (colIdx === 2) {
                const parsed = data.cell.raw;
                const colColors = pdfPassFailColors(parsed);
                data.cell.styles.fillColor = colColors.fill;
                data.cell.styles.textColor = colColors.text;
              }
            }
          });
          y = pdf.lastAutoTable.finalY + 12;
        } else {
          for (const clsName of classes) {
            const classPaperKeys = subj.components.filter(c => (c.meta && c.meta.className) === clsName).map(c => c.key);
            const thisPaperKeys = classPaperKeys.length ? classPaperKeys : paperKeys;
            const thisPaperLabels = subj.components.filter(c => thisPaperKeys.includes(c.key)).map(c => c.label);
            const head = [["Class", "Student", ...thisPaperLabels, "Final"]];

            const rows = subj.studentRows.filter(r => r.className === clsName).map(r => {
              const compMap = {};
              if (Array.isArray(r.components)) {
                r.components.forEach((c) => {
                  const key = `${r.className}||${String(c.subjectAllocId || "")}||${String(c.component)}`;
                  compMap[key] = c.percentage;
                });
              }
              const paperVals = thisPaperKeys.map(pk => (compMap[pk] != null ? compMap[pk] : ""));
              return [clsName, r.studentName, ...paperVals, r.finalMark];
            });

            const passCountClass = rows.filter(rr => {
              const val = rr[rr.length - 1];
              return typeof val === "number" ? val >= PASS_MARK : Number(val) >= PASS_MARK;
            }).length;
            const classPassRate = Math.round((passCountClass / Math.max(1, rows.length)) * 100);

            const pageHeight = pdf.internal.pageSize.height;
            if (y > pageHeight - 160) { pdf.addPage(); y = 40; }

            pdf.setFontSize(12).text(`${subj.name} — ${clsName}`, 40, y);
            y += 12;
            pdf.setFontSize(10).text(`Pass Rate (table): ${classPassRate}%`, 40, y);
            y += 10;

            autoTable(pdf, {
              startY: y,
              head,
              body: rows,
              styles: { fontSize: 9, cellPadding: 4 },
              theme: "grid",
              didParseCell: function (data) {
                if (data.section === "head") {
                  data.cell.styles.fillColor = [40, 40, 40];
                  data.cell.styles.textColor = [255, 255, 255];
                  return;
                }
                const colIdx = data.column.index;
                const papersStart = 2;
                const finalIdx = 2 + thisPaperKeys.length;
                if (colIdx >= papersStart && colIdx < finalIdx) {
                  const rawVal = data.cell.raw;
                  const parsed = typeof rawVal === "number" ? rawVal : rawVal === "" ? null : Number(rawVal);
                  const colColors = passFailColor(parsed);
                  data.cell.styles.fillColor = colColors.fill;
                  data.cell.styles.textColor = colColors.text;
                } else if (colIdx === finalIdx) {
                  const parsed = data.cell.raw;
                  const colColors = pdfPassFailColors(parsed);
                  data.cell.styles.fillColor = colColors.fill;
                  data.cell.styles.textColor = colColors.text;
                }
              },
              headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
              columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 140 } }
            });

            y = pdf.lastAutoTable.finalY + 12;
            if (y > pageHeight - 160) { pdf.addPage(); y = 40; }
          }
        }

        const blob = pdf.output("blob");
        zip.file(`subjects/subject_${subj.name.replace(/\s+/g, "_")}.pdf`, blob);
      }

      // PART B: add class PDFs
      for (const cls of classList) {
        const studentsInClass = reports.filter(r => r.className === cls);
        if (!studentsInClass.length) continue;

        const subjectMap = {};
        studentsInClass.forEach((r) => {
          r.subjects.forEach((s) => {
            if (!s || typeof s.finalMark !== "number" || s.finalMark === 0) return;
            subjectMap[s.name] ||= { name: s.name, values: [], componentsPool: {}, rows: [] };
            subjectMap[s.name].values.push(s.finalMark);
            if (Array.isArray(s.components)) {
              s.components.forEach((c) => {
                const key = `${String(c.subjectAllocId || "")}||${String(c.component)}`;
                subjectMap[s.name].componentsPool[key] ||= { arr: [], label: `${cls} - Paper:${c.component}`, key };
                subjectMap[s.name].componentsPool[key].arr.push(c.percentage ?? 0);
              });
            }
            subjectMap[s.name].rows.push({ studentName: r.name, finalMark: s.finalMark, components: s.components || [] });
          });
        });

        const subjectEntries = Object.values(subjectMap).map(entry => {
          const vals = entry.values;
          const m = mean(vals);
          const sd = std(vals);
          const med = median(vals);
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const q1 = quantile(vals, 0.25);
          const q3 = quantile(vals, 0.75);
          const theIqr = q3 - q1;
          const outliers = vals.filter(v => v < q1 - 1.5 * theIqr || v > q3 + 1.5 * theIqr).length;
          const passCount = vals.filter((v) => v >= PASS_MARK).length;
          const gradeCounts = GRADE_ORDER.reduce((acc, g) => ((acc[g] = 0), acc), {});
          vals.forEach(v => gradeCounts[gradeFromMark(v)]++);
          const components = Object.entries(entry.componentsPool).map(([k, obj]) => {
            const arr = obj.arr || [];
            return {
              key: k,
              label: obj.label,
              mean: Math.round(mean(arr)),
              sd: Math.round(std(arr)),
              median: Math.round(median(arr)),
              zeros: arr.filter((v) => v === 0).length,
              count: arr.length,
              zeroRate: Math.round((arr.filter((v) => v === 0).length / Math.max(1, arr.length)) * 100)
            };
          }).sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key));
          return { name: entry.name, mean: Math.round(m), sd: Math.round(sd), median: Math.round(med), min, max, q1: Math.round(q1), q3: Math.round(q3), iqr: Math.round(theIqr), outliers, count: vals.length, passRate: Math.round((passCount / Math.max(1, vals.length)) * 100), gradeCounts, components, rows: entry.rows };
        }).sort((a, b) => a.name.localeCompare(b.name));

        const pdf = new jsPDF({ unit: "pt", format: "a4" });
        let y = 40;
        pdf.setFontSize(16).text(`Class Analysis — ${cls} (All Subjects)`, 40, y);
        y += 20;
        pdf.setFontSize(11).text(`Students: ${studentsInClass.length}  |  Subjects analysed: ${subjectEntries.length}`, 40, y);
        y += 12;

        autoTable(pdf, {
          startY: y,
          head: [["Subject", "Count", "Mean", "Median", "SD", "Pass %", "A*", "A", "B", "C", "D", "E", "F"]],
          body: subjectEntries.map(s => [s.name, s.count, s.mean, s.median, s.sd, `${s.passRate}%`, s.gradeCounts['A*'] || 0, s.gradeCounts['A'] || 0, s.gradeCounts['B'] || 0, s.gradeCounts['C'] || 0, s.gradeCounts['D'] || 0, s.gradeCounts['E'] || 0, s.gradeCounts['F'] || 0]),
          styles: { fontSize: 8 },
          theme: "grid"
        });
        y = pdf.lastAutoTable.finalY + 10;

        for (const subj of subjectEntries) {
          pdf.setFontSize(12).text(`${subj.name} — summary`, 40, y);
          y += 12;
          pdf.setFontSize(10).text(`Mean: ${subj.mean}  Median: ${subj.median}  SD: ${subj.sd}  Pass: ${subj.passRate}%  Count: ${subj.count}`, 40, y);
          y += 8;
          pdf.setFontSize(10).text(`Pass Rate (table): ${subj.passRate}%`, 40, y);
          y += 10;

          if (subj.components && subj.components.length) {
            const paperKeys = subj.components.map(c => c.key);
            const head = [["Student", ...subj.components.map(c => c.label), "Final"]];
            const body = subj.rows.map(row => {
              const compMap = {};
              row.components.forEach(c => {
                const key = `${String(c.subjectAllocId || "")}||${String(c.component)}`;
                compMap[key] = c.percentage;
              });
              const paperVals = paperKeys.map(pk => (compMap[pk] != null ? compMap[pk] : ""));
              return [row.studentName, ...paperVals, row.finalMark];
            });

            autoTable(pdf, {
              startY: y,
              head: head,
              body: body,
              styles: { fontSize: 9, cellPadding: 4 },
              theme: "grid",
              didParseCell: function (data) {
                if (data.section === "head") {
                  data.cell.styles.fillColor = [40, 40, 40];
                  data.cell.styles.textColor = [255, 255, 255];
                  return;
                }
                const colIdx = data.column.index;
                const papersStart = 1;
                const papersEnd = 1 + paperKeys.length - 1;
                const finalIdx = 1 + paperKeys.length;
                if (colIdx >= papersStart && colIdx <= papersEnd) {
                  const rawVal = data.cell.raw;
                  const parsed = typeof rawVal === "number" ? rawVal : rawVal === "" ? null : Number(rawVal);
                  const colColors = passFailColor(parsed);
                  data.cell.styles.fillColor = colColors.fill;
                  data.cell.styles.textColor = colColors.text;
                } else if (colIdx === finalIdx) {
                  const parsed = data.cell.raw;
                  const colColors = pdfPassFailColors(parsed);
                  data.cell.styles.fillColor = colColors.fill;
                  data.cell.styles.textColor = colColors.text;
                } else {
                  data.cell.styles.fillColor = [255, 255, 255];
                  data.cell.styles.textColor = [0, 0, 0];
                }
              },
              columnStyles: {
                0: { cellWidth: 120 }
              }
            });

            y = pdf.lastAutoTable.finalY + 10;
          } else {
            const head = [["Student", "Final"]];
            const body = subj.rows.map(r => [r.studentName, r.finalMark]);
            autoTable(pdf, {
              startY: y,
              head,
              body,
              styles: { fontSize: 9 },
              theme: "grid",
              didParseCell: function (data) {
                if (data.section === "head") return;
                const colIdx = data.column.index;
                if (colIdx === 1) {
                  const parsed = data.cell.raw;
                  const colColors = pdfPassFailColors(parsed);
                  data.cell.styles.fillColor = colColors.fill;
                  data.cell.styles.textColor = colColors.text;
                }
              }
            });
            y = pdf.lastAutoTable.finalY + 10;
          }

          const sorted = [...subj.rows].sort((a, b) => b.finalMark - a.finalMark);
          const top = sorted.slice(0, 3);
          const bottom = sorted.slice(-3).reverse();
          autoTable(pdf, {
            startY: y,
            head: [["Top students", "Mark", "", "Bottom students", "Mark", ""]],
            body: Array.from({ length: Math.max(top.length, bottom.length) }).map((_, i) => [
              top[i] ? top[i].studentName : '', top[i] ? top[i].finalMark : '', '', bottom[i] ? bottom[i].studentName : '', bottom[i] ? bottom[i].finalMark : '', ''
            ]),
            styles: { fontSize: 9 },
            theme: "grid",
            columnStyles: { 2: { cellWidth: 10 }, 5: { cellWidth: 10 } }
          });
          y = pdf.lastAutoTable.finalY + 12;

          if (y > pdf.internal.pageSize.height - 120) { pdf.addPage(); y = 40; }
        }

        const blob = pdf.output("blob");
        zip.file(`classes/class_${cls.replace(/\s+/g, '_')}.pdf`, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `subjects_classes_combined_${Date.now()}.zip`);
      toast.success("Combined Subject & Class PDFs downloaded (single ZIP)");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate combined package");
    }
    setLoading(false);
  }

  // compact analysis PDF for selected class (keeps many metrics and highlights)
  function generatePDF() {
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const margin = 40;
    let y = 40;
    pdf.setFontSize(16).text(`Anomaly & Performance Analysis — ${selectedClass || "(All)"}`, margin, y);
    y += 22;
    pdf.setFontSize(11).text(`Generated: ${new Date().toLocaleString()}`, margin, y);
    y += 18;

    if (classSummary) {
      pdf.setFontSize(12).text("Class summary:", margin, y);
      y += 14;
      pdf.setFontSize(10).text(`Average subject mean: ${classSummary.avgMean}`, margin, y);
      pdf.setFontSize(10).text(`Average pass rate: ${classSummary.avgPassRate}%`, margin + 220, y);
      y += 18;
    }

    autoTable(pdf, {
      startY: y,
      head: [["Subject", "Count", "Mean", "Median", "SD", "Pass %", "A*", "A", "B", "C", "D", "E", "F"]],
      body: subjectStats.map(s => [s.name, s.count, s.mean, s.median, s.sd, `${s.passRate}%`, s.gradeCounts['A*'] || 0, s.gradeCounts['A'] || 0, s.gradeCounts['B'] || 0, s.gradeCounts['C'] || 0, s.gradeCounts['D'] || 0, s.gradeCounts['E'] || 0, s.gradeCounts['F'] || 0]),
      styles: { fontSize: 8 },
      theme: "grid",
      headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] }
    });
    let after = pdf.lastAutoTable.finalY + 12;

    const { needImprovement } = studentAnomalies;
    pdf.setFontSize(13).text("Priority student improvements (top 200):", margin, after);
    after += 14;
    if (needImprovement.length) {
      autoTable(pdf, {
        startY: after,
        head: [["Student", "Subject", "Final", "Reasons / Component Alerts"]],
        body: needImprovement.slice(0, 200).map(n => [
          n.studentName, n.subject, n.finalMark,
          [...(n.reasons || []).slice(0, 3), ...(n.componentAlerts || []).map(c => `Paper:${c.component}=${c.value}`)].join(" • ") || '—'
        ]),
        styles: { fontSize: 9 },
        theme: "grid",
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
        didParseCell: function (data) {
          if (data.section === "head") return;
          // final column index is 2
          if (data.column.index === 2) {
            const parsed = data.cell.raw;
            const colColors = pdfPassFailColors(parsed);
            data.cell.styles.fillColor = colColors.fill;
            data.cell.styles.textColor = colColors.text;
          }
        }
      });
      after = pdf.lastAutoTable.finalY + 12;
    } else {
      pdf.setFontSize(10).text("No students flagged for improvement by current rules.", margin, after);
      after += 12;
    }

    // component anomalies summary
    const compAnoms = [];
    subjectStats.forEach(s => {
      (s.components || []).forEach(c => {
        const zeroRate = (c.zeros / Math.max(c.count, 1)) * 100;
        if (zeroRate >= 30 || c.sd >= 20) compAnoms.push({ subject: s.name, component: c.label || c.key, ...c, zeroRate: Math.round(zeroRate) });
      });
    });

    if (compAnoms.length) {
      pdf.setFontSize(13).text("Component-level anomalies:", margin, after);
      after += 12;
      autoTable(pdf, {
        startY: after,
        head: [["Subject", "Paper", "Mean", "SD", "Zeros", "Count", "Zero %"]],
        body: compAnoms.map(c => [c.subject, c.component, c.mean, c.sd, c.zeros, c.count, `${c.zeroRate}%`]),
        styles: { fontSize: 9 },
        theme: "grid",
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] }
      });
      after = pdf.lastAutoTable.finalY + 12;
    }

    pdf.save(`anomaly-analysis-${selectedClass || 'all'}-${Date.now()}.pdf`);
    toast.success('PDF generated');
  }

  /* ----------------------------
     New: Generate 3 aggregated ranking PDFs and download as a zip
     ---------------------------- */
  async function downloadAggregateRankings() {
    if (!reports.length) return toast.error("No data available");
    setLoading(true);
    try {
      const zip = new JSZip();

      // 1) Classes overall pass rates
      const classMap = {}; // class => { total, pass }
      reports.forEach(r => {
        const cls = r.className || 'Unknown';
        classMap[cls] ||= { total: 0, pass: 0 };
        r.subjects.forEach(s => {
          if (!s || typeof s.finalMark !== 'number' || s.finalMark === 0) return;
          classMap[cls].total += 1;
          if (s.finalMark >= PASS_MARK) classMap[cls].pass += 1;
        });
      });

      const classesStats = Object.entries(classMap).map(([cls, v]) => ({ className: cls, count: v.total, passCount: v.pass, passRate: Math.round((v.pass / Math.max(1, v.total)) * 100) }));
      classesStats.sort((a, b) => b.passRate - a.passRate || b.passCount - a.passCount);

      const pdf1 = new jsPDF({ unit: 'pt', format: 'a4' });
      let y = 40;
      pdf1.setFontSize(16).text('Classes — Overall pass rate (all subjects) — Ranked', 40, y);
      y += 18;
      pdf1.setFontSize(10).text(`Generated: ${new Date().toLocaleString()}`, 40, y);
      y += 12;

      autoTable(pdf1, {
        startY: y,
        head: [['Rank', 'Class', 'Pass %', 'Count', 'PassCount']],
        body: classesStats.map((c, i) => [i + 1, c.className, `${c.passRate}%`, c.count, c.passCount]),
        styles: { fontSize: 10 },
        theme: 'grid',
        didParseCell: function (data) {
          if (data.section === 'head') return;
          // color Pass % column (index 2)
          if (data.column.index === 2) {
            const raw = data.cell.raw;
            const num = typeof raw === 'string' ? Number(String(raw).replace('%', '')) : Number(raw);
            const colors = pdfPassFailColors(num);
            data.cell.styles.fillColor = colors.fill;
            data.cell.styles.textColor = colors.text;
          }
        },
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] }
      });

      const blob1 = pdf1.output('blob');
      zip.file('classes-overall-passrates.pdf', blob1);

      // 2) Subjects overall pass rates (use globalSubjectStats computed earlier)
      const subjStats = globalSubjectStats.map(s => ({ name: s.name, passRate: s.passRate, count: s.count }));
      subjStats.sort((a, b) => b.passRate - a.passRate || b.count - a.count);

      const pdf2 = new jsPDF({ unit: 'pt', format: 'a4' });
      let y2 = 40;
      pdf2.setFontSize(16).text('Subjects — Overall pass rate (all classes) — Ranked', 40, y2);
      y2 += 18;
      pdf2.setFontSize(10).text(`Generated: ${new Date().toLocaleString()}`, 40, y2);
      y2 += 12;

      autoTable(pdf2, {
        startY: y2,
        head: [['Rank', 'Subject', 'Pass %', 'Count']],
        body: subjStats.map((s, i) => [i + 1, s.name, `${s.passRate}%`, s.count]),
        styles: { fontSize: 10 },
        theme: 'grid',
        didParseCell: function (data) {
          if (data.section === 'head') return;
          if (data.column.index === 2) {
            const raw = data.cell.raw;
            const num = typeof raw === 'string' ? Number(String(raw).replace('%', '')) : Number(raw);
            const colors = pdfPassFailColors(num);
            data.cell.styles.fillColor = colors.fill;
            data.cell.styles.textColor = colors.text;
          }
        },
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] }
      });

      const blob2 = pdf2.output('blob');
      zip.file('subjects-overall-passrates.pdf', blob2);

      // 3) All class-subject pairs
      const csMap = {}; // { class: { subject: {total,pass} } }
      reports.forEach(r => {
        const cls = r.className || 'Unknown';
        csMap[cls] ||= {};
        r.subjects.forEach(s => {
          if (!s || typeof s.finalMark !== 'number' || s.finalMark === 0) return;
          csMap[cls][s.name] ||= { total: 0, pass: 0 };
          csMap[cls][s.name].total += 1;
          if (s.finalMark >= PASS_MARK) csMap[cls][s.name].pass += 1;
        });
      });

      const classSubjectList = [];
      Object.entries(csMap).forEach(([cls, subjObj]) => {
        Object.entries(subjObj).forEach(([subjName, v]) => {
          const rate = Math.round((v.pass / Math.max(1, v.total)) * 100);
          classSubjectList.push({ className: cls, subject: subjName, count: v.total, passCount: v.pass, passRate: rate });
        });
      });
      classSubjectList.sort((a, b) => b.passRate - a.passRate || b.passCount - a.passCount);

      const pdf3 = new jsPDF({ unit: 'pt', format: 'a4' });
      let y3 = 40;
      pdf3.setFontSize(16).text('Class - Subject Pass Rates — Ranked (all pairs)', 40, y3);
      y3 += 18;
      pdf3.setFontSize(10).text(`Generated: ${new Date().toLocaleString()}`, 40, y3);
      y3 += 12;

      autoTable(pdf3, {
        startY: y3,
        head: [['Rank', 'Class', 'Subject', 'Pass %', 'Count', 'PassCount']],
        body: classSubjectList.map((c, i) => [i + 1, c.className, c.subject, `${c.passRate}%`, c.count, c.passCount]),
        styles: { fontSize: 9 },
        theme: 'grid',
        didParseCell: function (data) {
          if (data.section === 'head') return;
          if (data.column.index === 3) {
            const raw = data.cell.raw;
            const num = typeof raw === 'string' ? Number(String(raw).replace('%', '')) : Number(raw);
            const colors = pdfPassFailColors(num);
            data.cell.styles.fillColor = colors.fill;
            data.cell.styles.textColor = colors.text;
          }
        },
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] }
      });

      const blob3 = pdf3.output('blob');
      zip.file('class-subject-passrates.pdf', blob3);

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `rankings-reports-${Date.now()}.zip`);
      toast.success('Ranking PDFs downloaded');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate ranking PDFs');
    }
    setLoading(false);
  }

  /* ----------------------------
     New: Download single PDF that contains all three ranking tables in one document
     (Classes ranking, Subjects ranking, Class-Subject ranking)
     ---------------------------- */
  function downloadSingleRankingPDF() {
    if (!reports.length) {
      toast.error("No data available");
      return;
    }
    setLoading(true);
    try {
      // Prepare data
      // classes
      const classMap = {};
      reports.forEach(r => {
        const cls = r.className || 'Unknown';
        classMap[cls] ||= { total: 0, pass: 0, gradeCounts: GRADE_ORDER.reduce((a, g) => { a[g] = 0; return a; }, {}) };
        r.subjects.forEach(s => {
          if (!s || typeof s.finalMark !== 'number' || s.finalMark === 0) return;
          classMap[cls].total += 1;
          if (s.finalMark >= PASS_MARK) classMap[cls].pass += 1;
          const g = gradeFromMark(s.finalMark);
          classMap[cls].gradeCounts[g] = (classMap[cls].gradeCounts[g] || 0) + 1;
        });
      });
      const classesStats = Object.entries(classMap).map(([cls, v]) => ({ className: cls, count: v.total, passCount: v.pass, passRate: Math.round((v.pass / Math.max(1, v.total)) * 100), gradeCounts: v.gradeCounts }));
      classesStats.sort((a, b) => b.passRate - a.passRate || b.passCount - a.passCount);

      // subjects (use globalSubjectStats)
      const subjStats = globalSubjectStats.map(s => ({ name: s.name, passRate: s.passRate, count: s.count, gradeCounts: s.gradeCounts || {} }));
      subjStats.sort((a, b) => b.passRate - a.passRate || b.count - a.count);

      // class-subject pairs
      const csMap = {};
      reports.forEach(r => {
        const cls = r.className || 'Unknown';
        csMap[cls] ||= {};
        r.subjects.forEach(s => {
          if (!s || typeof s.finalMark !== 'number' || s.finalMark === 0) return;
          csMap[cls][s.name] ||= { total: 0, pass: 0 };
          csMap[cls][s.name].total += 1;
          if (s.finalMark >= PASS_MARK) csMap[cls][s.name].pass += 1;
        });
      });
      const classSubjectList = [];
      Object.entries(csMap).forEach(([cls, subjObj]) => {
        Object.entries(subjObj).forEach(([subjName, v]) => {
          const rate = Math.round((v.pass / Math.max(1, v.total)) * 100);
          classSubjectList.push({ className: cls, subject: subjName, count: v.total, passCount: v.pass, passRate: rate });
        });
      });
      classSubjectList.sort((a, b) => b.passRate - a.passRate || b.passCount - a.passCount);

      // Create single PDF
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      let y = 40;

      // 1) Classes ranking
      pdf.setFontSize(16).text('1) Classes — Overall pass rate (all subjects) — Ranked', 40, y);
      y += 18;
      pdf.setFontSize(10).text(`Generated: ${new Date().toLocaleString()}`, 40, y);
      y += 12;

      autoTable(pdf, {
        startY: y,
        head: [['Rank', 'Class', 'Count', 'Pass %', 'A*', 'A', 'B', 'C', 'D', 'E']],
        body: classesStats.map((c, i) => [
          i + 1,
          c.className,
          c.count,
          `${c.passRate}%`,
          c.gradeCounts['A*'] || 0,
          c.gradeCounts['A'] || 0,
          c.gradeCounts['B'] || 0,
          c.gradeCounts['C'] || 0,
          c.gradeCounts['D'] || 0,
          c.gradeCounts['E'] || 0
        ]),
        styles: { fontSize: 9 },
        theme: 'grid',
        didParseCell: function (data) {
          if (data.section === 'head') return;
          if (data.column.index === 3) {
            const raw = data.cell.raw;
            const num = typeof raw === 'string' ? Number(String(raw).replace('%', '')) : Number(raw);
            const colors = pdfPassFailColors(num);
            data.cell.styles.fillColor = colors.fill;
            data.cell.styles.textColor = colors.text;
          }
        },
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] }
      });

      // start next section on new page
      pdf.addPage();
      y = 40;

      // 2) Subjects ranking
      pdf.setFontSize(16).text('2) Subjects — Overall pass rate (all classes) — Ranked', 40, y);
      y += 18;
      pdf.setFontSize(10).text(`Generated: ${new Date().toLocaleString()}`, 40, y);
      y += 12;

      autoTable(pdf, {
        startY: y,
        head: [['Rank', 'Subject', 'Count', 'Pass %', 'A*', 'A', 'B', 'C', 'D', 'E']],
        body: subjStats.map((s, i) => [
          i + 1,
          s.name,
          s.count,
          `${s.passRate}%`,
          s.gradeCounts['A*'] || 0,
          s.gradeCounts['A'] || 0,
          s.gradeCounts['B'] || 0,
          s.gradeCounts['C'] || 0,
          s.gradeCounts['D'] || 0,
          s.gradeCounts['E'] || 0
        ]),
        styles: { fontSize: 9 },
        theme: 'grid',
        didParseCell: function (data) {
          if (data.section === 'head') return;
          if (data.column.index === 3) {
            const raw = data.cell.raw;
            const num = typeof raw === 'string' ? Number(String(raw).replace('%', '')) : Number(raw);
            const colors = pdfPassFailColors(num);
            data.cell.styles.fillColor = colors.fill;
            data.cell.styles.textColor = colors.text;
          }
        },
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] }
      });

      // next section on new page
      pdf.addPage();
      y = 40;

      // 3) Class-Subject ranking
      pdf.setFontSize(16).text('3) Class - Subject Pass Rates — Ranked (all pairs)', 40, y);
      y += 18;
      pdf.setFontSize(10).text(`Generated: ${new Date().toLocaleString()}`, 40, y);
      y += 12;

      autoTable(pdf, {
        startY: y,
        head: [['Rank', 'Class', 'Subject', 'Count', 'Pass %']],
        body: classSubjectList.map((c, i) => [i + 1, c.className, c.subject, c.count, `${c.passRate}%`]),
        styles: { fontSize: 9 },
        theme: 'grid',
        didParseCell: function (data) {
          if (data.section === 'head') return;
          if (data.column.index === 4) {
            const raw = data.cell.raw;
            const num = typeof raw === 'string' ? Number(String(raw).replace('%', '')) : Number(raw);
            const colors = pdfPassFailColors(num);
            data.cell.styles.fillColor = colors.fill;
            data.cell.styles.textColor = colors.text;
          }
        },
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] }
      });

      // Save the single PDF
      pdf.save(`rankings-single-${Date.now()}.pdf`);
      toast.success("Single ranking PDF downloaded");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate single ranking PDF");
    }
    setLoading(false);
  }

  return (
    <div className="p-4 md:p-6 bg-slate-900 min-h-screen text-white">
      <h1 className="text-2xl md:text-3xl mb-4">Admin: Anomaly & Performance Analysis</h1>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div className="flex gap-2 flex-wrap">
          {classList.map((cls) => (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              className={`px-3 py-1 rounded text-sm ${selectedClass === cls ? 'bg-red-600' : 'bg-slate-700'}`}
              aria-pressed={selectedClass === cls}
            >
              {cls}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2 flex-wrap items-center">
          <button onClick={generatePDF} className="bg-red-600 px-3 py-2 rounded text-sm">Download Analysis PDF</button>

          {/* SUBJECTS: now downloads a single combined PDF containing all subject tables (each subject on a fresh page) */}
          <button onClick={downloadSubjectPDFsAcrossClasses} className="bg-blue-600 px-3 py-2 rounded text-sm" disabled={loading}>
            Download Subjects (single PDF)
          </button>

          {/* Keep the original Class PDFs (all subjects) button as requested */}
          <button onClick={downloadClassPDFsAcrossSubjects} className="bg-green-600 px-3 py-2 rounded text-sm" disabled={loading}>
            Download Class PDFs (all subjects)
          </button>

          {/* NEW: Combined single ZIP button that includes both subject PDFs and class PDFs */}
          <button onClick={downloadCombinedSubjectAndClassPDFs} className="bg-teal-600 px-3 py-2 rounded text-sm" disabled={loading}>
            Download Subject & Class PDFs (combined ZIP)
          </button>

          {/* Ranking downloads */}
          <button onClick={downloadAggregateRankings} className="bg-indigo-600 px-3 py-2 rounded text-sm" disabled={loading}>
            Download Ranking PDFs (3)
          </button>
          <button onClick={downloadSingleRankingPDF} className="bg-yellow-600 px-3 py-2 rounded text-sm" disabled={loading}>
            Download Single Ranking PDF
          </button>
        </div>
      </div>

      {loading ? (<p>Loading…</p>) : (
        <div className="space-y-6">
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-slate-800 rounded">
              <div className="text-sm text-slate-300">Students</div>
              <div className="text-2xl">{reportsForClass.length}</div>
            </div>
            <div className="p-4 bg-slate-800 rounded">
              <div className="text-sm text-slate-300">Subjects</div>
              <div className="text-2xl">{subjectStats.length}</div>
            </div>
            <div className="p-4 bg-slate-800 rounded">
              <div className="text-sm text-slate-300">Detected anomalies (z)</div>
              <div className="text-2xl">{studentAnomalies.anomalies.length}</div>
            </div>
            <div className="p-4 bg-slate-800 rounded">
              <div className="text-sm text-slate-300">Students needing improvement</div>
              <div className="text-2xl">{studentAnomalies.needImprovement.length}</div>
            </div>
          </section>

          <section className="mb-6">
            <h2 className="text-xl mb-2">Class summary</h2>
            <div className="bg-slate-800 rounded p-3">
              {classSummary ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-700 rounded">
                    <div className="text-sm">Average subject mean</div>
                    <div className="text-2xl">{classSummary.avgMean}</div>
                  </div>
                  <div className="p-3 bg-slate-700 rounded">
                    <div className="text-sm">Average pass rate</div>
                    <div className="text-2xl">{classSummary.avgPassRate}%</div>
                  </div>
                  <div className="p-3 bg-slate-700 rounded">
                    <div className="text-sm">Top subject</div>
                    <div className="text-2xl">{classSummary.top[0]?.name || '—'}</div>
                  </div>
                </div>
              ) : (<p>No data for summary</p>)}
            </div>
          </section>

          <section className="mb-6">
            <h2 className="text-xl mb-2">Grade distribution (overall)</h2>
            <div className="bg-slate-800 rounded p-3">
              <div className="grid grid-cols-7 text-center text-sm gap-2">
                {GRADE_ORDER.map(g => (
                  <div key={g} className="p-2 bg-slate-700 rounded">
                    <div className="text-xs">{g}</div>
                    <div className="text-xl">{overallGradeDistribution[g] || 0}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mb-6">
            <h2 className="text-xl mb-2">Subjects — Class statistics (detailed)</h2>
            <div className="bg-slate-800 rounded p-3 overflow-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="bg-slate-700 text-left">
                    <th className="p-2">Subject</th>
                    <th className="p-2">Count</th>
                    <th className="p-2">Mean</th>
                    <th className="p-2">Median</th>
                    <th className="p-2">SD</th>
                    <th className="p-2">Pass %</th>
                    <th className="p-2">Grades</th>
                    <th className="p-2">Components (paper:mean)</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectStats.map((s) => (
                    <tr key={s.name} className="border-b border-slate-700">
                      <td className="p-2">{s.name}</td>
                      <td className="p-2">{s.count}</td>
                      <td className="p-2">{s.mean}</td>
                      <td className="p-2">{s.median}</td>
                      <td className="p-2">{s.sd}</td>
                      <td className="p-2">{s.passRate}%</td>
                      <td className="p-2">{GRADE_ORDER.map(g => `${g}:${s.gradeCounts[g] || 0}`).join(', ')}</td>
                      <td className="p-2">{s.components.length ? s.components.map(c => `${c.label}:${c.mean}`).join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-6">
            <h2 className="text-xl mb-2">Student improvement recommendations (priority)</h2>
            <div className="bg-slate-800 rounded p-3 overflow-auto">
              {studentAnomalies.needImprovement.length ? (
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-700 text-left">
                      <th className="p-2">Student</th>
                      <th className="p-2">Subject</th>
                      <th className="p-2">Final</th>
                      <th className="p-2">Pass</th>
                      <th className="p-2">Reasons & paper alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentAnomalies.needImprovement.map((n, i) => {
                      const isPass = typeof n.finalMark === "number" ? n.finalMark >= PASS_MARK : Number(n.finalMark) >= PASS_MARK;
                      return (
                        <tr key={i} className="border-b border-slate-700">
                          <td className="p-2">{n.studentName}</td>
                          <td className="p-2">{n.subject}</td>
                          <td className="p-2">{n.finalMark}</td>
                          <td className="p-2">
                            <span className={`inline-block px-2 py-1 rounded text-xs ${isPass ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                              {isPass ? 'Pass' : 'Fail'}
                            </span>
                          </td>
                          <td className="p-2">{[...n.reasons, ...(n.componentAlerts || []).map(c => `Paper ${c.component}: ${c.value}`)].join(' • ')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (<p>No students require targeted improvement by current rules.</p>)}
            </div>
          </section>

          <section>
            <h2 className="text-xl mb-2">Component anomalies (class-level)</h2>
            <div className="bg-slate-800 rounded p-3">
              {(() => {
                // compute component anomalies quickly
                const compAnoms = [];
                subjectStats.forEach(s => {
                  (s.components || []).forEach(c => {
                    const zeroRate = (c.zeros / Math.max(c.count, 1)) * 100;
                    if (zeroRate >= 30 || c.sd >= 20) compAnoms.push({ subject: s.name, component: c.label || c.key, mean: c.mean, sd: c.sd, zeros: c.zeros, count: c.count, zeroRate: Math.round(zeroRate) });
                  });
                });
                return compAnoms.length ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-700 text-left">
                        <th className="p-2">Subject</th>
                        <th className="p-2">Component</th>
                        <th className="p-2">Mean</th>
                        <th className="p-2">SD</th>
                        <th className="p-2">Zeros</th>
                        <th className="p-2">Zero %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compAnoms.map((c, i) => (
                        <tr key={i} className="border-b border-slate-700">
                          <td className="p-2">{c.subject}</td>
                          <td className="p-2">{c.component}</td>
                          <td className="p-2">{c.mean}</td>
                          <td className="p-2">{c.sd}</td>
                          <td className="p-2">{c.zeros}</td>
                          <td className="p-2">{c.zeroRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No component anomalies detected (needs paper-level data).</p>
                );
              })()}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
