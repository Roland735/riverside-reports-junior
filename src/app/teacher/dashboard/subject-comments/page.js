"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
    FiDownload,
    FiUpload,
    FiLoader,
    FiChevronDown,
    FiChevronUp,
} from "react-icons/fi";

export default function SubjectCommentsPage() {
    const [allocs, setAllocs] = useState([]);
    const [activePeriod, setActive] = useState(null);
    const [openGroup, setOpenGroup] = useState(null);
    const [dataMap, setDataMap] = useState({});
    const [loadingMap, setLoadingMap] = useState({});
    const [uploadingMap, setUploadingMap] = useState({});
    const [selectedTabs, setSelectedTabs] = useState({});
    const indexRef = useRef({});

    useEffect(() => {
        (async () => {
            const pRes = await fetch("/api/exam-periods");
            const { periods } = await pRes.json();
            setActive(periods.find((p) => p.active) || null);

            const aRes = await fetch("/api/dashboard/teacher");
            const { allocations } = await aRes.json();
            setAllocs(allocations || []);
        })();
    }, []);

    const groupedAllocs = allocs.reduce((groups, alloc) => {
        const key = `${alloc.subject}-${alloc.classId.grade}-${alloc.classId.section}`;
        if (!groups[key]) {
            groups[key] = {
                subject: alloc.subject,
                grade: alloc.classId.grade,
                section: alloc.classId.section,
                papers: [],
            };
        }
        groups[key].papers.push(alloc);
        return groups;
    }, {});
    const groupKeys = Object.keys(groupedAllocs);

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

    async function fetchGroupData(groupKey) {
        setLoadingMap((m) => ({ ...m, [groupKey]: true }));
        const allocIds = groupedAllocs[groupKey].papers.map((p) => p._id);
        const res = await fetch(
            `/api/comments/template?allocationIds=${allocIds.join(
                ","
            )}&examPeriodId=${activePeriod._id}`
        );
        const { rows } = await res.json();

        // Normalize: remove periodTest & behaviour grade, keep comment
        const norm = rows.map((r) => ({
            ...r,
            comment: r.comment || "",
        }));

        setDataMap((m) => ({
            ...m,
            [groupKey]: { rows: norm, groupInfo: groupedAllocs[groupKey] },
        }));
        setSelectedTabs((m) => ({ ...m, [groupKey]: 0 }));
        setLoadingMap((m) => ({ ...m, [groupKey]: false }));
    }

    async function downloadTemplate(groupKey) {
        setLoadingMap((m) => ({ ...m, [groupKey]: true }));
        const allocIds = groupedAllocs[groupKey].papers.map((p) => p._id);
        const res = await fetch(
            `/api/comments/template?allocationIds=${allocIds.join(
                ","
            )}&examPeriodId=${activePeriod._id}`
        );
        const { rows } = await res.json();

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows, {
            header: [
                "studentId",
                "name",
                ...Object.keys(rows[0] || {}).filter((k) => k.startsWith("Paper")),
                "average",
                "stddev",
                "comment",
            ],
        });
        XLSX.utils.book_append_sheet(wb, ws, "Comments");
        XLSX.writeFile(
            wb,
            `${groupedAllocs[groupKey].subject}_${groupedAllocs[groupKey].grade}` +
            `-${groupedAllocs[groupKey].section}_comments.xlsx`
        );
        setLoadingMap((m) => ({ ...m, [groupKey]: false }));
    }

    function uploadFile(groupKey, e) {
        const file = e.target.files[0];
        if (!file) return;
        file.arrayBuffer().then((buf) => {
            const wb = XLSX.read(buf);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const parsed = XLSX.utils.sheet_to_json(ws, { defval: "" });
            const rows = parsed.map((r) => ({
                studentId: r.studentId,
                comment: r.comment || "",
                ...Object.fromEntries(
                    Object.entries(r).filter(([k]) => k.startsWith("Paper"))
                ),
            }));
            setDataMap((m) => ({
                ...m,
                [groupKey]: { ...m[groupKey], rows },
            }));
            e.target.value = "";
        });
    }

    async function saveComments(groupKey) {
        const { rows } = dataMap[groupKey];
        setUploadingMap((m) => ({ ...m, [groupKey]: true }));

        const allocIds = groupedAllocs[groupKey].papers.map((p) => p._id);
        await fetch("/api/comments/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                allocationIds: allocIds,
                examPeriodId: activePeriod._id,
                rows,
            }),
        });

        setUploadingMap((m) => ({ ...m, [groupKey]: false }));
        alert("Saved comments and assessments");
    }

    if (!activePeriod)
        return <p className="text-white p-6">No active exam period set.</p>;

    return (
        <div className="p-6 space-y-8 max-w-5xl mx-auto">
            <h1 className="text-2xl text-white">
                Subject Comments — {activePeriod.name}
            </h1>

            {groupKeys.map((groupKey) => {
                const group = groupedAllocs[groupKey];
                const data = dataMap[groupKey];
                const loading = loadingMap[groupKey];
                const uploading = uploadingMap[groupKey];
                const isOpen = openGroup === groupKey;
                const selectedIndex = selectedTabs[groupKey] ?? 0;
                const currentRow = data?.rows?.[selectedIndex];

                return (
                    <div key={groupKey} className="bg-slate-800 rounded shadow">
                        <button
                            onClick={() => {
                                if (isOpen) {
                                    setOpenGroup(null);
                                } else {
                                    setOpenGroup(groupKey);
                                    if (!data) fetchGroupData(groupKey);
                                }
                            }}
                            className="w-full flex justify-between items-center p-4"
                        >
                            <span className="text-white">
                                {group.subject} — {group.grade}-{group.section}
                                <span className="text-sm text-slate-400 ml-2">
                                    ({group.papers.length} paper
                                    {group.papers.length > 1 ? "s" : ""})
                                </span>
                            </span>
                            {isOpen ? (
                                <FiChevronUp className="text-white" />
                            ) : (
                                <FiChevronDown className="text-white" />
                            )}
                        </button>

                        {isOpen && (
                            <div className="p-4 space-y-4">
                                {/* Papers */}
                                <div className="flex flex-wrap gap-2">
                                    {group.papers.map((p) => (
                                        <div
                                            key={p._id}
                                            className="px-3 py-1 bg-slate-700 rounded text-sm text-white"
                                        >
                                            Paper {p.paper}
                                        </div>
                                    ))}
                                </div>

                                {/* Progress bar */}
                                {data && (() => {
                                    const total = data.rows.length;
                                    const done = data.rows.filter((r) => r.comment?.trim())
                                        .length;
                                    const pct = total ? Math.round((done / total) * 100) : 0;
                                    return (
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-sm text-white/80">
                                                <span>Comments done:</span>
                                                <span>
                                                    {done} / {total} ({pct}%)
                                                </span>
                                            </div>
                                            <div className="w-full bg-gray-600 h-2 rounded">
                                                <div
                                                    className="bg-green-500 h-2 rounded"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Download/Upload */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => downloadTemplate(groupKey)}
                                        disabled={loading}
                                        className="flex items-center px-3 py-1 bg-red-600 rounded text-white disabled:opacity-50"
                                    >
                                        {loading ? (
                                            <FiLoader className="animate-spin mr-1" />
                                        ) : (
                                            <FiDownload className="mr-1" />
                                        )}
                                        Download Template
                                    </button>
                                    <label className="flex items-center px-3 py-1 bg-blue-600 rounded text-white cursor-pointer">
                                        <FiUpload className="mr-1" /> Upload Excel
                                        <input
                                            type="file"
                                            accept=".xlsx"
                                            className="hidden"
                                            onChange={(e) => uploadFile(groupKey, e)}
                                        />
                                    </label>
                                </div>

                                {/* Tabs */}
                                {data ? (
                                    <>
                                        <div className="flex overflow-x-auto gap-2 py-2">
                                            {data.rows.map((r, i) => {
                                                const completed = r.comment?.trim();
                                                return (
                                                    <button
                                                        key={i}
                                                        onClick={() =>
                                                            setSelectedTabs((m) => ({
                                                                ...m,
                                                                [groupKey]: i,
                                                            }))
                                                        }
                                                        className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition ${completed
                                                            ? "bg-green-500 text-white"
                                                            : "bg-slate-700 text-white/80"
                                                            } ${selectedIndex === i
                                                                ? "ring-2 ring-white"
                                                                : "opacity-90 hover:opacity-100"
                                                            }`}
                                                    >
                                                        {r.name}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Single-student panel */}
                                        <div
                                            className={`${getGradeInfo(
                                                currentRow?.average
                                            ).color} p-6 rounded-xl shadow-lg`}
                                        >
                                            {/* Header */}
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="text-white font-bold text-xl">
                                                        {currentRow?.name}
                                                    </h3>
                                                    <p className="text-slate-200 text-sm mt-1">
                                                        Student ID: {currentRow?.studentId}
                                                    </p>
                                                </div>
                                                <div
                                                    className={`${getGradeInfo(currentRow?.average).color
                                                        } text-white px-3 py-1 rounded-lg font-bold`}
                                                >
                                                    {getGradeInfo(currentRow?.average).grade}
                                                </div>
                                            </div>

                                            {/* Papers breakdown */}
                                            <div className="grid grid-cols-3 gap-3 mt-4">
                                                {Object.keys(currentRow || {})
                                                    .filter((k) => k.startsWith("Paper"))
                                                    .map((k) => {
                                                        const mark = currentRow[k];
                                                        const info = getGradeInfo(mark);
                                                        return (
                                                            <div
                                                                key={k}
                                                                className="bg-white/20 rounded-lg p-3"
                                                            >
                                                                <div className="text-white/80 text-xs">
                                                                    {k.replace("Paper", "Paper ")}
                                                                </div>
                                                                <div className="flex items-center justify-between mt-1">
                                                                    <span className="text-white font-medium">
                                                                        {mark}%
                                                                    </span>
                                                                    <span
                                                                        className={`${info.color} text-xs text-white px-2 py-1 rounded font-bold`}
                                                                    >
                                                                        {info.grade}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                            </div>

                                            {/* Stats & Inputs (only Average & Std Dev now) */}
                                            <div className="grid grid-cols-2 gap-3 mt-4 text-white">
                                                <div>
                                                    <div className="text-xs">Average</div>
                                                    <div className="font-medium">
                                                        {currentRow?.average ?? "—"}%
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-xs">Std Dev</div>
                                                    <div className="font-medium">{currentRow?.stddev ?? "—"}</div>
                                                </div>
                                            </div>

                                            {/* Comment textarea */}
                                            <div className="mt-4">
                                                <label className="block text-white/80 mb-2 text-sm">
                                                    Teacher Comments
                                                </label>
                                                <textarea
                                                    rows={3}
                                                    className="w-full p-3 bg-white/20 rounded-lg text-white placeholder-white/50 focus:ring-2 focus:ring-white"
                                                    placeholder="Enter feedback..."
                                                    value={currentRow?.comment ?? ""}
                                                    onChange={(e) => {
                                                        const upd = [...(data.rows || [])];
                                                        upd[selectedIndex].comment = e.target.value;
                                                        setDataMap((dm) => ({
                                                            ...dm,
                                                            [groupKey]: { ...dm[groupKey], rows: upd },
                                                        }));
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-gray-400">Loading data…</p>
                                )}

                                <button
                                    onClick={() => saveComments(groupKey)}
                                    disabled={uploading}
                                    className="flex items-center px-4 py-2 bg-green-600 rounded text-white disabled:opacity-50"
                                >
                                    {uploading && <FiLoader className="animate-spin mr-2" />}
                                    Save All
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
