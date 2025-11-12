// app/teacher/marks/page.js
"use client";
import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
    BarChart, Bar, XAxis, YAxis,
    Tooltip, ResponsiveContainer,
    CartesianGrid,
} from "recharts";
import {
    FiDownload, FiUpload, FiLoader,
    FiTrash2, FiEdit2, FiX,
    FiUsers, FiTrendingUp, FiAlertCircle
} from "react-icons/fi";

export default function TeacherMarksPage() {
    const [allocs, setAllocs] = useState([]);
    const [activePeriod, setActivePeriod] = useState(null);

    const [marksExist, setMarksExist] = useState({});
    const [statsMap, setStatsMap] = useState({});
    const [existingMarks, setExistingMarks] = useState([]);
    const [modalTotal, setModalTotal] = useState("");
    const [selectedAlloc, setSelectedAlloc] = useState(null);

    const [showModal, setShowModal] = useState(false);
    const [previewRows, setPreviewRows] = useState([]);
    const [totalMarks, setTotalMarks] = useState("");
    const [loadingTemplate, setLoadingTemplate] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [file, setFile] = useState(null);
    const [uploadAlloc, setUploadAlloc] = useState(null);
    const [uploadError, setUploadError] = useState("");

    // 1) initial fetch
    useEffect(() => {
        (async () => {
            const [aRes, pRes] = await Promise.all([
                fetch("/api/dashboard/teacher"),
                fetch("/api/exam-periods"),
            ]);
            const { allocations } = await aRes.json();
            const { periods } = await pRes.json();
            setAllocs(allocations || []);
            const active = periods.find(p => p.active) || null;
            setActivePeriod(active);

            // populate marksExist & statsMap
            const results = await Promise.all(
                (allocations || []).map(async a => {
                    const res = await fetch(
                        `/api/marks?subjectAllocId=${a._id}&examPeriodId=${active?._id}`
                    );
                    const { marks } = await res.json();
                    const has = marks?.length > 0;
                    let stats = null;
                    if (has) {
                        const vals = marks.map(m => m.mark);
                        stats = {
                            count: vals.length,
                            average: (vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(1),
                            highest: Math.max(...vals),
                            lowest: Math.min(...vals),
                        };
                    }
                    return { id: a._id, has, stats };
                })
            );
            const me = {}, sm = {};
            results.forEach(r => {
                me[r.id] = r.has;
                if (r.stats) sm[r.id] = r.stats;
            });
            setMarksExist(me);
            setStatsMap(sm);
        })();
    }, []);

    // open modal & load marks + total
    const openManage = async alloc => {
        setSelectedAlloc(alloc);
        const res = await fetch(
            `/api/marks?subjectAllocId=${alloc._id}&examPeriodId=${activePeriod._id}`
        );
        const { marks } = await res.json();
        setExistingMarks(marks || []);
        setModalTotal(marks?.[0]?.totalMarks ?? "");
        setShowModal(true);
    };

    // bulk-delete handler
    const handleDeleteBulk = async alloc => {
        if (!confirm(`Delete ALL marks for ${alloc.classId.grade}-${alloc.classId.section} • ${alloc.subject} (P${alloc.paper}) in ${activePeriod.name}?`)) {
            return;
        }
        const res = await fetch("/api/marks/batch", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                examPeriodId: activePeriod._id,
                subjectAllocId: alloc._id,
                paper: alloc.paper
            }),
        });
        if (!res.ok) {
            const { error } = await res.json();
            return alert("Error deleting marks: " + error);
        }
        setMarksExist(prev => ({ ...prev, [alloc._id]: false }));
        setStatsMap(prev => {
            const copy = { ...prev };
            delete copy[alloc._id];
            return copy;
        });
        alert("All marks deleted.");
    };

    const handleSaveChanges = async () => {
        if (!modalTotal || existingMarks.length === 0) return;
        await fetch("/api/marks/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                examPeriodId: activePeriod._id,
                subjectAllocId: selectedAlloc._id,
                totalMarks: Number(modalTotal),
                rows: existingMarks.map(m => ({
                    studentId: m.studentId._id,
                    mark: m.mark,
                    paper: m.paper,
                })),
            }),
        });
        alert("Changes saved!");
        setShowModal(false);
        openManage(selectedAlloc);
    };

    const handleTemplate = async alloc => {
        if (!activePeriod) return alert("No active period");
        setLoadingTemplate(true);
        const res = await fetch(
            `/api/marks/template?allocId=${alloc._id}&examPeriodId=${activePeriod._id}`
        );
        const json = await res.json();
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(json.rows, {
            header: ["studentId", "name", "mark"]
        });
        XLSX.utils.book_append_sheet(wb, ws, "Marks");
        XLSX.writeFile(
            wb,
            `${json.allocation.subject}_P${json.allocation.paper}_${activePeriod.name}.xlsx`
        );
        setLoadingTemplate(false);
    };

    // Open upload modal for a specific allocation
    const openUploadModal = alloc => {
        setUploadAlloc(alloc);
        setUploadModalOpen(true);
        setFile(null);
        setPreviewRows([]);
        setUploadError("");
    };

    // Handle file selection for upload
    const handleFileChange = e => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;
        if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
            setUploadError("Please upload an Excel file (.xlsx or .xls)");
            return;
        }
        setFile(selectedFile);
        setUploadError("");
        const reader = new FileReader();
        reader.onload = event => {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            if (!jsonData[0] || !('studentId' in jsonData[0]) || !('mark' in jsonData[0])) {
                setUploadError("Invalid file format. Please use the provided template.");
                return;
            }
            setPreviewRows(jsonData);
        };
        reader.readAsArrayBuffer(selectedFile);
    };

    // Upload marks from the Excel file
    const uploadMarks = async () => {
        if (!file || !previewRows.length || !uploadAlloc || !activePeriod) {
            setUploadError("Please select a valid file first");
            return;
        }
        if (!totalMarks || isNaN(totalMarks) || totalMarks <= 0) {
            setUploadError("Please enter a valid total marks value");
            return;
        }
        setUploading(true);
        setUploadError("");
        try {
            const response = await fetch("/api/marks/batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    examPeriodId: activePeriod._id,
                    subjectAllocId: uploadAlloc._id,
                    totalMarks: Number(totalMarks),
                    rows: previewRows.map(row => ({
                        studentId: row.studentId,
                        mark: row.mark,
                        paper: uploadAlloc.paper
                    }))
                })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || "Upload failed");
            }
            setMarksExist(prev => ({ ...prev, [uploadAlloc._id]: true }));
            alert("Marks uploaded successfully!");
            setUploadModalOpen(false);
            openManage(uploadAlloc);
        } catch (err) {
            setUploadError(err.message || "Failed to upload marks");
        } finally {
            setUploading(false);
        }
    };

    if (!activePeriod) {
        return <p className="text-white">No active exam period set.</p>;
    }

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-6">
            <h1 className="text-2xl text-white flex items-center space-x-2">
                <FiUsers /> <span>Upload Marks</span>
            </h1>
            <p className="text-white flex items-center space-x-2">
                <FiTrendingUp /> <strong>Period:</strong> {activePeriod.name}
            </p>

            {/* Subject list */}
            <div>
                <p className="text-white mb-2 flex items-center space-x-1">
                    <FiAlertCircle /> <span>Your Subjects:</span>
                </p>
                {allocs.map(a => (
                    <div
                        key={a._id}
                        className="flex justify-between items-center bg-slate-800 p-3 rounded mb-2"
                    >
                        <span className="flex items-center space-x-2 text-white">
                            <FiDownload />
                            <span>
                                {a.classId.grade}-{a.classId.section} • {a.subject} (P{a.paper})
                            </span>
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleTemplate(a)}
                                disabled={loadingTemplate}
                                className="flex items-center px-3 py-1 bg-red-600 rounded text-white disabled:opacity-50"
                            >
                                {loadingTemplate
                                    ? <FiLoader className="animate-spin mr-1" />
                                    : <FiDownload className="mr-1" />}
                                Template
                            </button>

                            {marksExist[a._id] ? (
                                <>
                                    <button
                                        onClick={() => openManage(a)}
                                        className="flex items-center px-3 py-1 bg-blue-600 rounded text-white"
                                    >
                                        <FiTrendingUp className="mr-1" /> Stats & Manage
                                    </button>
                                    <button
                                        onClick={() => handleDeleteBulk(a)}
                                        className="flex items-center px-3 py-1 bg-red-700 rounded text-white"
                                    >
                                        <FiTrash2 className="mr-1" /> Delete All
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => openUploadModal(a)}
                                    className="flex items-center px-3 py-1 bg-green-600 rounded text-white"
                                >
                                    <FiUpload className="mr-1" /> Upload Marks
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Manage Modal */}
            {showModal && selectedAlloc && (
                <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-800 p-6 rounded w-full max-w-2xl space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl text-white flex items-center space-x-2">
                                <FiEdit2 /><span>Manage Marks</span>
                            </h2>
                            <button onClick={() => setShowModal(false)}>
                                <FiX className="text-white" />
                            </button>
                        </div>

                        {/* Total Marks input */}
                        <div className="flex items-center space-x-4 text-white">
                            <label>Total Marks:</label>
                            <input
                                type="number" min="1"
                                value={modalTotal}
                                onChange={e => setModalTotal(e.target.value)}
                                className="w-24 px-2 py-1 bg-slate-700 rounded"
                            />
                        </div>

                        {/* Inline-edit table */}
                        <div className="overflow-auto max-h-64">
                            <table className="w-full text-sm text-white">
                                <thead>
                                    <tr className="border-b border-slate-600">
                                        <th className="p-1">Student</th>
                                        <th className="p-1">Mark</th>
                                        <th className="p-1">%</th>
                                        <th className="p-1">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {existingMarks.map((m, i) => {
                                        const pct = modalTotal
                                            ? ((m.mark / Number(modalTotal)) * 100).toFixed(1)
                                            : "";
                                        return (
                                            <tr key={m._id} className="border-b border-slate-700">
                                                <td className="p-1">{m.studentId.name}</td>
                                                <td className="p-1">
                                                    <input
                                                        type="number" min="0" max={modalTotal}
                                                        value={m.mark}
                                                        onChange={e => {
                                                            const val = Number(e.target.value);
                                                            const updated = [...existingMarks];
                                                            updated[i].mark = val;
                                                            setExistingMarks(updated);
                                                        }}
                                                        className="w-16 px-1 py-0.5 bg-slate-700 rounded text-white text-center"
                                                    />
                                                </td>
                                                <td className="p-1">{pct}%</td>
                                                <td className="p-1 flex gap-2">
                                                    <button
                                                        onClick={async () => {
                                                            await fetch(`/api/marks/batch`, {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({
                                                                    examPeriodId: activePeriod._id,
                                                                    subjectAllocId: selectedAlloc._id,
                                                                    totalMarks: Number(modalTotal),
                                                                    rows: [{ studentId: m.studentId._id, mark: 0, paper: m.paper }]
                                                                })
                                                            });
                                                            openManage(selectedAlloc);
                                                        }}
                                                    >
                                                        <FiTrash2 className="text-white" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 bg-gray-600 rounded text-white"
                            >Cancel</button>
                            <button
                                onClick={handleSaveChanges}
                                disabled={!modalTotal || existingMarks.length === 0}
                                className="px-4 py-2 bg-green-600 rounded text-white disabled:opacity-50"
                            >Save Changes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Marks Modal */}
            {uploadModalOpen && uploadAlloc && (
                <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-800 p-6 rounded w-full max-w-2xl space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl text-white flex items-center space-x-2">
                                <FiUpload /><span>Upload Marks for {uploadAlloc.subject}</span>
                            </h2>
                            <button onClick={() => setUploadModalOpen(false)}>
                                <FiX className="text-white" />
                            </button>
                        </div>

                        <div className="space-y-4 text-white">
                            <div>
                                <p className="mb-2">1. Download the template and fill in student marks</p>
                                <p className="mb-2">2. Upload the completed file below</p>
                            </div>

                            <div className="space-y-2">
                                <label className="block">Total Marks:</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={totalMarks}
                                    onChange={e => setTotalMarks(e.target.value)}
                                    placeholder="Enter total marks for this subject"
                                    className="w-full px-3 py-2 bg-slate-700 rounded"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block">Excel File:</label>
                                <div className="flex items-center space-x-2">
                                    <label className="cursor-pointer bg-slate-700 px-4 py-2 rounded flex items-center">
                                        <FiUpload className="mr-2" />
                                        {file ? file.name : "Choose File"}
                                        <input
                                            type="file"
                                            accept=".xlsx, .xls"
                                            className="hidden"
                                            onChange={handleFileChange}
                                        />
                                    </label>
                                </div>
                            </div>

                            {uploadError && (
                                <div className="text-red-400 bg-red-900/30 p-2 rounded">
                                    {uploadError}
                                </div>
                            )}

                            {previewRows.length > 0 && (
                                <div className="max-h-64 overflow-y-auto">
                                    <h3 className="text-lg font-medium mb-2">Preview:</h3>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-700">
                                                <th className="p-2">Student ID</th>
                                                <th className="p-2">Name</th>
                                                <th className="p-2">Mark</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewRows.slice(0, 5).map((row, index) => (
                                                <tr key={index} className="border-b border-slate-700">
                                                    <td className="p-2">{row.studentId}</td>
                                                    <td className="p-2">{row.name}</td>
                                                    <td className="p-2">{row.mark}</td>
                                                </tr>
                                            ))}
                                            {previewRows.length > 5 && (
                                                <tr>
                                                    <td colSpan="3" className="p-2 text-center text-slate-400">
                                                        + {previewRows.length - 5} more records
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="flex justify-end space-x-2 pt-4">
                                <button
                                    onClick={() => setUploadModalOpen(false)}
                                    className="px-4 py-2 bg-gray-600 rounded text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={uploadMarks}
                                    disabled={uploading || !file || !previewRows.length || !totalMarks}
                                    className="px-4 py-2 bg-green-600 rounded text-white disabled:opacity-50 flex items-center"
                                >
                                    {uploading ? (
                                        <>
                                            <FiLoader className="animate-spin mr-2" />
                                            Uploading....
                                        </>
                                    ) : (
                                        "Upload Marks"
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
