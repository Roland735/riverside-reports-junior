// src/app/class-characteristics/page.jsx
"use client";

import { useEffect, useState } from "react";
import { FiLoader, FiSave, FiChevronDown, FiCheck } from "react-icons/fi";

const CAMBRIDGE_GRADES = ["A*", "A", "B", "C", "D", "E", "U"];

export default function ClassCharacteristicsPage() {
  const [classes, setClasses] = useState([]);
  const [activePeriod, setActivePeriod] = useState(null);
  const [openClass, setOpenClass] = useState(null);
  const [dataMap, setDataMap] = useState({});
  const [loadingMap, setLoadingMap] = useState({});
  const [savingMap, setSavingMap] = useState({});
  const [selectedMap, setSelectedMap] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const pRes = await fetch("/api/exam-periods");
        const pJson = await pRes.json();
        setActivePeriod(pJson.periods?.find((p) => p.active) || null);

        const cRes = await fetch("/api/dashboard/classteacher");
        const cJson = await cRes.json();
        setClasses(cJson.classes || []);
      } catch (err) {
        console.error("Failed to load initial data", err);
      }
    })();
  }, []);

  /**
   * Fetch class template (students) and existing characteristics for those students,
   * then merge so saved grades show on load.
   */
  async function fetchClassData(classId) {
    setLoadingMap((m) => ({ ...m, [classId]: true }));
    try {
      const res = await fetch(
        `/api/comments/class-template?classId=${classId}&examPeriodId=${activePeriod?._id}`
      );
      const { rows = [], classInfo = {} } = await res.json();

      // Build studentIds list
      const studentIds = rows.map((r) => r.studentId).filter(Boolean);
      let charMap = {};

      if (studentIds.length) {
        // Fetch existing characteristic docs for these students
        const charsRes = await fetch("/api/characteristics/by-students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentIds }),
        });

        if (charsRes.ok) {
          const charsJson = await charsRes.json().catch(() => ({}));
          const docs = charsJson.docs || [];
          // map by studentId (string)
          charMap = Object.fromEntries(
            docs.map((d) => [String(d.studentId), d])
          );
        } else {
          console.warn(
            "Failed to load existing characteristics; continuing without them."
          );
        }
      }

      // initialize grade fields, but populate from charMap when present
      const rowsWithGrades = rows.map((r) => {
        const existing = charMap[String(r.studentId)] || {};
        const punctuality = existing.punctuality || "";
        const behaviour = existing.behaviour || "";
        const dressing = existing.dressing || "";
        const attendance = existing.attendance || "";

        const allFilled = punctuality && behaviour && dressing && attendance;

        return {
          studentId: r.studentId,
          name: r.name,
          punctuality,
          behaviour,
          dressing,
          attendance,
          attendanceDays: r.attendance ?? 0,
          saved: Boolean(allFilled), // mark saved if doc had all four grades
        };
      });

      setDataMap((m) => ({
        ...m,
        [classId]: { rows: rowsWithGrades, classInfo },
      }));
      setSelectedMap((m) => ({ ...m, [classId]: 0 }));
    } catch (err) {
      console.error("Failed to fetch class data", err);
      alert("Failed to load class data.");
    } finally {
      setLoadingMap((m) => ({ ...m, [classId]: false }));
    }
  }

  function updateGrade(classId, idx, field, value) {
    setDataMap((m) => {
      const copy = { ...m };
      const rows = [...copy[classId].rows];
      rows[idx] = { ...rows[idx], [field]: value };
      // Clearing 'saved' flag if teacher edits after saving
      if (rows[idx].saved) rows[idx].saved = false;
      copy[classId] = { ...copy[classId], rows };
      return copy;
    });
  }

  // Save only completed rows (all 4 grades present). Server will upsert those rows.
  async function saveCharacteristics(classId) {
    const payload = dataMap[classId];
    if (!payload) return;

    // Partition rows: completed rows have all 4 grades filled
    const completed = payload.rows.filter(
      (r) => r.punctuality && r.behaviour && r.dressing && r.attendance
    );

    const skipped = payload.rows.length - completed.length;

    if (completed.length === 0) {
      alert(
        "No students have all four characteristic grades filled. Please enter at least one complete set before saving."
      );
      return;
    }

    setSavingMap((m) => ({ ...m, [classId]: true }));

    try {
      const res = await fetch("/api/characteristics/class-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          examPeriodId: activePeriod?._id,
          rows: completed.map((r) => ({
            studentId: r.studentId,
            punctuality: r.punctuality,
            behaviour: r.behaviour,
            dressing: r.dressing,
            attendance: r.attendance,
          })),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = json?.error || "Failed to save completed characteristics";
        throw new Error(msg);
      }

      // server returns savedCount and errors (by studentId)
      const savedCount = json.savedCount ?? completed.length;
      const errors = json.errors ?? [];

      // update local state: mark saved rows with `saved: true` for those actually saved
      setDataMap((m) => {
        const copy = { ...m };
        const rows = copy[classId].rows.map((row) => {
          const wasCompleted = completed.find(
            (c) => c.studentId === row.studentId
          );
          const errored = errors.find((e) => e.studentId === row.studentId);
          if (wasCompleted && !errored) {
            return { ...row, saved: true };
          }
          return row;
        });
        copy[classId] = { ...copy[classId], rows };
        return copy;
      });

      alert(
        `Saved ${savedCount} student(s). Skipped ${skipped} student(s) with missing grade(s). ${
          errors.length ? ` ${errors.length} failed to save.` : ""
        }`
      );
      if (errors.length) console.warn("Save errors:", errors);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save characteristics.");
    } finally {
      setSavingMap((m) => ({ ...m, [classId]: false }));
    }
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
          Class Characteristics — {activePeriod.name}
        </h1>
        <p className="text-slate-400">
          Enter Cambridge characteristic grades for students (Punctuality,
          Behaviour, Dressing, Attendance).
        </p>
      </div>

      {classes.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-8 text-center border border-slate-700">
          <h3 className="text-xl text-white mb-2">No Classes Assigned</h3>
          <p className="text-slate-400">
            You don't have any classes assigned to you for this period.
          </p>
        </div>
      ) : (
        classes.map((cls) => {
          const data = dataMap[cls._id];
          const loading = loadingMap[cls._id];
          const saving = savingMap[cls._id];
          const isOpen = openClass === cls._id;
          const selected = selectedMap[cls._id] ?? 0;

          let total = 0,
            done = 0;
          if (data) {
            total = data.rows.length;
            done = data.rows.filter(
              (r) => r.punctuality && r.behaviour && r.dressing && r.attendance
            ).length;
          }
          const pct = total ? Math.round((done / total) * 100) : 0;

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
                      Completed: {pct}%
                    </span>
                  </div>
                </div>
                <FiChevronDown
                  className={`text-white text-xl transform transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isOpen && data && (
                <div className="p-5 space-y-6">
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
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => saveCharacteristics(cls._id)}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 rounded-xl disabled:opacity-50 text-white shadow-md hover:shadow-lg transition-all ml-auto"
                    >
                      {saving ? (
                        <FiLoader className="animate-spin mr-2" />
                      ) : (
                        <FiSave className="mr-2" />
                      )}{" "}
                      Save Completed
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {data.rows.map((r, idx) => {
                        const complete =
                          r.punctuality &&
                          r.behaviour &&
                          r.dressing &&
                          r.attendance;
                        const isActive = idx === selected;
                        const baseClass = `px-3 py-1 rounded-lg font-medium truncate ${
                          isActive
                            ? "ring-2 ring-cyan-500"
                            : "opacity-80 hover:opacity-100"
                        }`;
                        const stateClass = r.saved
                          ? "bg-green-800 text-white"
                          : complete
                          ? "bg-green-600 text-white"
                          : "bg-slate-700 text-slate-200";
                        return (
                          <button
                            key={r.studentId}
                            onClick={() =>
                              setSelectedMap((m) => ({ ...m, [cls._id]: idx }))
                            }
                            className={`${baseClass} ${stateClass}`}
                          >
                            {r.name}{" "}
                            {r.saved && <FiCheck className="inline ml-2" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* selected student card */}
                    {(() => {
                      const r = data.rows[selected];
                      return (
                        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 border border-slate-700 rounded-2xl shadow-xl">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-xl font-bold text-white">
                                {r.name}
                              </h3>
                              <p className="text-slate-400 text-sm mt-1">
                                ID: {r.studentId}
                              </p>
                            </div>
                            {r.saved && (
                              <div className="flex items-center gap-2 text-emerald-200">
                                <FiCheck /> Saved
                              </div>
                            )}
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-4">
                            {/* NOTE: selects are EDITABLE even if r.saved === true */}
                            <Field
                              label="Punctuality"
                              value={r.punctuality}
                              onChange={(v) =>
                                updateGrade(cls._id, selected, "punctuality", v)
                              }
                            />
                            <Field
                              label="Behaviour"
                              value={r.behaviour}
                              onChange={(v) =>
                                updateGrade(cls._id, selected, "behaviour", v)
                              }
                            />
                            <Field
                              label="Dressing"
                              value={r.dressing}
                              onChange={(v) =>
                                updateGrade(cls._id, selected, "dressing", v)
                              }
                            />
                            <Field
                              label="Attendance (grade)"
                              value={r.attendance}
                              onChange={(v) =>
                                updateGrade(cls._id, selected, "attendance", v)
                              }
                            />
                          </div>

                          <div className="mt-4 text-sm text-slate-400">
                            <div>
                              Attendance days (info): {r.attendanceDays ?? 0}
                            </div>
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

function Field({ label, value, onChange }) {
  return (
    <div className="bg-slate-700/50 p-3 rounded-xl border border-slate-600">
      <label className="text-slate-300 block mb-2 font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 rounded bg-slate-800 border border-slate-600 text-white"
      >
        <option value="">-- select grade --</option>
        {CAMBRIDGE_GRADES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  );
}
