"use client";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
    FiDownload, FiUpload, FiLoader,
    FiChevronDown
} from "react-icons/fi";

function getGradeInfo(mark) {
    const m = parseFloat(mark);
    if (isNaN(m)) return { grade: "N/A", color: "bg-gray-500" };
    if (m >= 90) return { grade: "A*", color: "bg-emerald-700" };
    if (m >= 80) return { grade: "A", color: "bg-emerald-600" };
    if (m >= 70) return { grade: "B", color: "bg-blue-500" };
    if (m >= 60) return { grade: "C", color: "bg-yellow-500" };
    if (m >= 50) return { grade: "D", color: "bg-amber-500" };
    if (m >= 40) return { grade: "E", color: "bg-orange-500" };
    return { grade: "U", color: "bg-red-600" };
}

export default function ClassCommentsPage() {
    const [classes, setClasses] = useState([]);
    const [activePeriod, setActive] = useState(null);
    const [openClass, setOpenClass] = useState(null);
    const [dataMap, setDataMap] = useState({});
    const [loadingMap, setLoadingMap] = useState({});
    const [uploadingMap, setUploadingMap] = useState({});
    const [selectedMap, setSelectedMap] = useState({});

    useEffect(() => {
        (async () => {
            const pRes = await fetch("/api/exam-periods");
            const { periods } = await pRes.json();
            setActive(periods.find(p => p.active) || null);

            const cRes = await fetch("/api/dashboard/classteacher");
            const { classes } = await cRes.json();
            setClasses(classes || []);
        })();
    }, []);

    async function fetchClassData(classId) {
        setLoadingMap(m => ({ ...m, [classId]: true }));
        const res = await fetch(
            `/api/comments/class-template?classId=${classId}&examPeriodId=${activePeriod._id}`
        );
        const { rows, classInfo } = await res.json();
        setDataMap(m => ({ ...m, [classId]: { rows, classInfo } }));
        setSelectedMap(m => ({ ...m, [classId]: 0 }));
        setLoadingMap(m => ({ ...m, [classId]: false }));
    }

    async function downloadTemplate(classId) {
        setLoadingMap(m => ({ ...m, [classId]: true }));
        const res = await fetch(
            `/api/comments/class-template?classId=${classId}&examPeriodId=${activePeriod._id}`
        );
        const { rows, classInfo } = await res.json();

        const { subjects, totalDays } = classInfo;
        const flat = rows.map(r => {
            const obj = { studentId: r.studentId, name: r.name };
            subjects.forEach(sub => {
                const s = r.subjects.find(x => x.subject === sub);
                obj[sub] = s ? s.percentage : "";
            });
            obj.attendance = r.attendance ?? "";
            obj.comment = r.comment || "";
            return obj;
        });

        const wb = XLSX.utils.book_new();
        const header = ["studentId", "name", ...subjects, "attendance", "comment"];
        const ws = XLSX.utils.json_to_sheet(flat, { header });
        XLSX.utils.book_append_sheet(wb, ws, "ClassComments");
        XLSX.writeFile(wb, `${classInfo.grade}-${classInfo.section}_comments.xlsx`);

        setLoadingMap(m => ({ ...m, [classId]: false }));
    }

    function uploadFile(classId, e) {
        const file = e.target.files[0];
        if (!file) return;
        file.arrayBuffer().then(buf => {
            const wb = XLSX.read(buf);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const parsed = XLSX.utils.sheet_to_json(ws, { defval: "" });

            const { subjects, totalDays } = dataMap[classId].classInfo;
            const rows = parsed.map(row => ({
                studentId: row.studentId,
                name: row.name,
                subjects: subjects.map(sub => ({
                    subject: sub,
                    percentage: parseFloat(row[sub]) || 0
                })),
                attendance: Math.min(
                    parseInt(row.attendance, 10) || 0,
                    totalDays
                ),
                comment: row.comment || ""
            }));

            setDataMap(m => ({
                ...m,
                [classId]: { ...m[classId], rows }
            }));
            e.target.value = "";
        });
    }

    async function saveComments(classId) {
        const { rows } = dataMap[classId];
        setUploadingMap(m => ({ ...m, [classId]: true }));
        await fetch("/api/comments/class-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ classId, examPeriodId: activePeriod._id, rows })
        });
        setUploadingMap(m => ({ ...m, [classId]: false }));
        alert("Saved comments & attendance!");
    }

    if (!activePeriod) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-900">
                <div className="bg-slate-800 p-8 rounded-xl shadow-lg text-center max-w-md">
                    <h2 className="text-2xl font-bold text-white mb-2">
                        No Active Exam Period
                    </h2>
                    <p className="text-slate-400 mb-4">
                        There is currently no active exam period set in the system.
                    </p>
                    <p className="text-slate-500 text-sm">
                        Please contact your administrator to set an active exam period.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto">
            <div className="bg-slate-800 rounded-xl p-6 shadow-xl border border-slate-700">
                <h1 className="text-3xl font-bold text-white mb-2">
                    Class Comments — {activePeriod.name}
                </h1>
                <p className="text-slate-400">
                    Manage student comments and attendance for each class
                </p>
            </div>

            {classes.length === 0 ? (
                <div className="bg-slate-800 rounded-xl p-8 text-center border border-slate-700">
                    <h3 className="text-xl text-white mb-2">No Classes Assigned</h3>
                    <p className="text-slate-400">
                        You don&apos;t have any classes assigned to you for this period.
                    </p>
                </div>
            ) : (
                classes.map(cls => {
                    const data = dataMap[cls._id];
                    const loading = loadingMap[cls._id];
                    const uploading = uploadingMap[cls._id];
                    const isOpen = openClass === cls._id;
                    const selected = selectedMap[cls._id] ?? 0;

                    let total = 0, done = 0;
                    if (data) {
                        total = data.rows.length;
                        // only count as done when BOTH attendance > 0 AND comment is non-empty
                        done = data.rows.filter(r => (Number(r.attendance) > 0) && (r.comment?.trim())).length;
                    }
                    const pct = total ? Math.round(done / total * 100) : 0;

                    return (
                        <div
                            key={cls._id}
                            className="bg-slate-800 rounded-xl shadow-xl overflow-hidden border border-slate-700"
                        >
                            <button
                                className="w-full flex justify-between items-center p-5 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 transition-all"
                                onClick={() => {
                                    setOpenClass(isOpen ? null : cls._id);
                                    if (!data) fetchClassData(cls._id);
                                }}
                            >
                                <div className="text-left">
                                    <span className="text-xl font-bold text-white">
                                        {cls.grade}-{cls.section}
                                    </span>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="px-2 py-1 bg-slate-700 rounded text-sm text-slate-300">
                                            {cls.subjectCount} subjects
                                        </span>
                                        <span className="px-2 py-1 bg-slate-700 rounded text-sm text-slate-300">
                                            {cls.studentCount} students
                                        </span>
                                        <span className="px-2 py-1 bg-slate-700 rounded text-sm text-slate-300">
                                            Avg: {cls.averagePercent || 0}%
                                        </span>
                                    </div>
                                </div>
                                <FiChevronDown
                                    className={`text-white text-xl transform transition-transform ${isOpen ? "rotate-180" : ""
                                        }`}
                                />
                            </button>

                            {isOpen && data && (
                                <div className="p-5 space-y-6">
                                    {/* Progress bar */}
                                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-slate-300 font-medium">
                                                Completion Progress
                                            </span>
                                            <span className="text-slate-300">
                                                {done}/{total} ({pct}%)
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-700 h-3 rounded-full overflow-hidden">
                                            <div
                                                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <div className="mt-3 flex justify-between text-sm">
                                            <span className="text-slate-400">Not Started</span>
                                            <span className="text-slate-400">Completed</span>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            onClick={() => downloadTemplate(cls._id)}
                                            disabled={loading}
                                            className="flex items-center px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 rounded-xl disabled:opacity-50 text-white shadow-md hover:shadow-lg transition-all"
                                        >
                                            {loading ? (
                                                <FiLoader className="animate-spin mr-2" />
                                            ) : (
                                                <FiDownload className="mr-2" />
                                            )}
                                            Download Template
                                        </button>

                                        <label className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl cursor-pointer text-white shadow-md hover:shadow-lg transition-all">
                                            <FiUpload className="mr-2" /> Upload Filled
                                            <input
                                                type="file"
                                                accept=".xlsx"
                                                className="hidden"
                                                onChange={e => uploadFile(cls._id, e)}
                                            />
                                        </label>

                                        <button
                                            onClick={() => saveComments(cls._id)}
                                            disabled={uploading}
                                            className="flex items-center px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 rounded-xl disabled:opacity-50 text-white shadow-md hover:shadow-lg transition-all ml-auto"
                                        >
                                            {uploading && <FiLoader className="animate-spin mr-2" />}
                                            Save All Data
                                        </button>
                                    </div>

                                    {/* Student tabs */}
                                    <div className="space-y-4">
                                        <div className="flex flex-wrap gap-2">
                                            {data.rows.map((r, idx) => {
                                                // tab considered complete only if BOTH attendance > 0 AND comment is non-empty
                                                const complete = (Number(r.attendance) > 0) && Boolean(r.comment?.trim());
                                                const isActive = idx === selected;
                                                return (
                                                    <button
                                                        key={r.studentId}
                                                        onClick={() =>
                                                            setSelectedMap(m => ({ ...m, [cls._id]: idx }))
                                                        }
                                                        className={`px-3 py-1 rounded-lg font-medium truncate ${complete
                                                            ? "bg-green-600 text-white"
                                                            : "bg-slate-700 text-slate-200"
                                                            } ${isActive
                                                                ? "ring-2 ring-cyan-500"
                                                                : "opacity-80 hover:opacity-100"
                                                            }`}
                                                    >
                                                        {r.name}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Selected student panel */}
                                        {(() => {
                                            const r = data.rows[selected];
                                            const avg =
                                                r.subjects.reduce((a, s) => a + s.percentage, 0) /
                                                r.subjects.length;
                                            const overall = getGradeInfo(avg);
                                            const attendancePct = Math.round(
                                                (r.attendance || 0) /
                                                data.classInfo.totalDays *
                                                100
                                            );

                                            return (
                                                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 border border-slate-700 rounded-2xl shadow-xl">
                                                    {/* Header */}
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <h3 className="text-xl font-bold text-white">
                                                                {r.name}
                                                            </h3>
                                                            <p className="text-slate-400 text-sm mt-1">
                                                                ID: {r.studentId}
                                                            </p>
                                                        </div>
                                                        <div
                                                            className={`${overall.color} text-white px-3 py-1 rounded-xl font-bold shadow-md`}
                                                        >
                                                            {overall.grade} • {avg.toFixed(1)}%
                                                        </div>
                                                    </div>

                                                    {/* Attendance */}
                                                    <div className="mt-4 bg-slate-700/30 p-3 rounded-xl">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-slate-300 font-medium">
                                                                Attendance
                                                            </span>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={data.classInfo.totalDays}
                                                                    value={r.attendance || 0}
                                                                    onChange={e => {
                                                                        const v = Math.min(
                                                                            Math.max(+e.target.value, 0),
                                                                            data.classInfo.totalDays
                                                                        );
                                                                        const copy = [...data.rows];
                                                                        copy[selected].attendance = v;
                                                                        setDataMap(m => ({
                                                                            ...m,
                                                                            [cls._id]: {
                                                                                ...m[cls._id],
                                                                                rows: copy
                                                                            }
                                                                        }));
                                                                    }}
                                                                    className="w-16 p-1 bg-slate-800 border border-slate-600 rounded text-white text-center"
                                                                />
                                                                <span className="text-slate-300 text-sm">
                                                                    / {data.classInfo.totalDays} days
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-2">
                                                            <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                                                                <div
                                                                    className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full"
                                                                    style={{ width: `${attendancePct}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-sm text-slate-300">
                                                                {attendancePct}%
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Subjects */}
                                                    <div className="mt-4">
                                                        <h4 className="text-slate-300 font-medium mb-2">
                                                            Subject Performance
                                                        </h4>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {r.subjects.map((s, subIdx) => {
                                                                const gi = getGradeInfo(s.percentage);
                                                                return (
                                                                    <div
                                                                        key={`${s.subject}-${subIdx}`}
                                                                        className="bg-slate-700/50 p-3 rounded-xl border border-slate-600"
                                                                    >
                                                                        <div className="flex justify-between items-start">
                                                                            <span className="text-white font-medium truncate max-w-[100px]">
                                                                                {s.subject}
                                                                            </span>
                                                                            <span
                                                                                className={`${gi.color} text-white text-xs px-2 py-1 rounded-lg font-bold`}
                                                                            >
                                                                                {gi.grade}
                                                                            </span>
                                                                        </div>
                                                                        <div className="mt-2 flex items-baseline gap-1">
                                                                            <span className="text-2xl font-bold text-white">
                                                                                {s.percentage}%
                                                                            </span>
                                                                            <span className="text-slate-400 text-sm">
                                                                                score
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Comment */}
                                                    <div className="mt-5">
                                                        <h4 className="text-slate-300 font-medium mb-2">
                                                            Teacher Comments
                                                        </h4>
                                                        <textarea
                                                            rows={3}
                                                            className="w-full p-3 bg-slate-800/50 rounded-xl border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 transition-all"
                                                            placeholder="Enter constructive feedback..."
                                                            value={r.comment}
                                                            onChange={e => {
                                                                const copy = [...data.rows];
                                                                copy[selected].comment = e.target.value;
                                                                setDataMap(m => ({
                                                                    ...m,
                                                                    [cls._id]: {
                                                                        ...m[cls._id],
                                                                        rows: copy
                                                                    }
                                                                }));
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
