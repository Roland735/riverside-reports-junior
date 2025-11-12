// src/seed/seed.js
//
// Improved seeder that looks in ../models (i.e. src/models when run from src/seed)
// Tries multiple filename variants and extensions (.js, .mjs, .cjs).
// Uses file:// URL dynamic import for robust cross-platform ESM imports.

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mongo URI fallback (can be overridden with MONGODB_URI env var)
const MONGODB_URI =
    process.env.MONGODB_URI ||
    process.env.NEXT_PUBLIC_MONGODB_URI ||
    "mongodb://127.0.0.1:27017/RiversideJuniorReports";

async function connect() {
    console.log("Connecting to MongoDB...", MONGODB_URI);
    await mongoose.connect(MONGODB_URI, {
        // modern drivers don't need useNewUrlParser / useUnifiedTopology flags
    });
    console.log("Connected.");
}

/**
 * Try to import a model from a list of candidate absolute file paths.
 * For each candidate we also try adding .js/.mjs/.cjs if necessary.
 * Returns imported module (mod.default || mod) or null.
 */
async function tryImportModel(candidates = []) {
    for (const candidate of candidates) {
        // Candidate may be absolute path or relative; normalize to absolute
        let abs = candidate;
        if (!path.isAbsolute(abs)) {
            abs = path.resolve(abs);
        }

        const tryList = [];
        // if candidate already has an extension, try as-is; otherwise try common extensions then as-is
        if (/\.(js|mjs|cjs)$/i.test(abs)) {
            tryList.push(abs);
        } else {
            tryList.push(`${abs}.js`, `${abs}.mjs`, `${abs}.cjs`, abs);
        }

        for (const p of tryList) {
            try {
                const fileUrl = pathToFileURL(p).href;
                // dynamic import - works for ESM and for CommonJS (Node returns default)
                const mod = await import(fileUrl);
                return mod.default || mod;
            } catch (err) {
                // swallow and try next path
            }
        }
    }
    return null;
}

/**
 * Build candidate paths for each logical model name.
 * This will try:
 *   - ../models/Name(.js|.mjs|.cjs)
 *   - ../models/name(.js|...)
 *   - ./models/Name(.js|...)  (in case you run script from project root)
 *   - absolute fallback: path.resolve(process.cwd(), "src/models", ...)
 */
function buildCandidatesForModel(name) {
    const candidates = [];
    const baseFromSeed = path.resolve(__dirname, "..", "models"); // src/models if seed in src/seed
    const baseFromCwd = path.resolve(process.cwd(), "src", "models");
    const baseFromCwdRoot = path.resolve(process.cwd(), "models");

    // Common filename variants to test
    const variants = [name, name.toLowerCase(), name.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "")];

    for (const base of [baseFromSeed, baseFromCwd, baseFromCwdRoot]) {
        for (const v of variants) {
            candidates.push(path.join(base, v));
            candidates.push(path.join(base, v + ".js"));
            candidates.push(path.join(base, v + ".mjs"));
            candidates.push(path.join(base, v + ".cjs"));
        }
    }

    // also try relative to seed folder (older style)
    for (const v of variants) {
        candidates.push(path.resolve(__dirname, "models", v));
        candidates.push(path.resolve(__dirname, "models", v + ".js"));
    }

    return Array.from(new Set(candidates)); // unique
}

async function loadModels() {
    const MODEL_NAMES = [
        "User",
        "Class",
        "Student",
        "Subject",
        "SubjectAllocation",
        "ExamPeriod",
        "Mark",
        "SubjectAssessment",
        "CambridgeCharacteristic",
        "Attendance",
        "Comment",
    ];

    const models = {};
    for (const name of MODEL_NAMES) {
        const candidates = buildCandidatesForModel(name);
        const m = await tryImportModel(candidates);
        if (m) {
            models[name] = m.default || m;
            console.log(`Loaded model "${name}" from ${m?.fileName || "imported module"}`);
        } else {
            // fallback to mongoose.models if already registered by another file
            models[name] = mongoose.models[name] || null;
            if (!models[name]) {
                console.warn(`Warning: could not import model "${name}". Tried ${candidates.slice(0, 6).join(", ")}...`);
            } else {
                console.log(`Using mongoose.models["${name}"] fallback.`);
            }
        }
    }

    return models;
}

function slugify(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function camGradePick(i) {
    const grades = ["A*", "A", "B", "C", "D", "E", "U"];
    return grades[i % grades.length];
}

async function seed() {
    await connect();
    const models = await loadModels();

    // Required model keys
    const required = [
        "User",
        "Class",
        "Student",
        "Subject",
        "SubjectAllocation",
        "ExamPeriod",
        "Mark",
        "SubjectAssessment",
        "CambridgeCharacteristic",
        "Attendance",
        "Comment",
    ];
    const missing = required.filter((r) => !models[r]);
    if (missing.length) {
        console.warn(
            `The following models could not be located: ${missing.join(", ")}\nThe script will still attempt to seed what it can.`
        );
    }

    // Clear collections if available
    for (const name of required) {
        const Model = models[name];
        if (Model) {
            try {
                await Model.deleteMany({});
                console.log(`Cleared ${name} collection.`);
            } catch (e) {
                console.warn(`Could not clear ${name}:`, e.message || e);
            }
        }
    }

    // ---------------------------------------------------
    // The rest of your seeding logic stays the same as your original script
    // For brevity I'll reuse the same structure you had (users, classes, subjects, students, allocations, marks...)
    // ---------------------------------------------------

    // 1) Users
    let adminUser = null;
    let teacherAlice = null;
    let teacherBob = null;
    let classTeacher = null;
    try {
        if (models.User) {
            const pw = "password123";
            const hash = await bcrypt.hash(pw, 10);
            adminUser = await models.User.create({
                name: "Admin User",
                email: "admin@school.local",
                passwordHash: hash,
                role: "admin",
            });
            teacherAlice = await models.User.create({
                name: "Alice Teacher",
                email: "alice.teacher@school.local",
                passwordHash: hash,
                role: "teacher",
            });
            teacherBob = await models.User.create({
                name: "Bob Teacher",
                email: "bob.teacher@school.local",
                passwordHash: hash,
                role: "teacher",
            });
            classTeacher = await models.User.create({
                name: "Carol ClassTeacher",
                email: "carol.ct@school.local",
                passwordHash: hash,
                role: "classteacher",
            });
            console.log("Created users (admin, teachers, classteacher).");
        }
    } catch (err) {
        console.error("Failed to create users:", err);
    }

    // 2) Classes
    let class7A = null;
    let class7B = null;
    try {
        if (models.Class) {
            class7A = await models.Class.create({
                grade: "Grade 7",
                section: "A",
                classTeacherId: classTeacher ? classTeacher._id : null,
            });
            class7B = await models.Class.create({
                grade: "Grade 7",
                section: "B",
                classTeacherId: teacherAlice ? teacherAlice._id : null,
            });
            console.log("Created classes Grade 7A and 7B.");
        }
    } catch (err) {
        console.error("Failed to create classes:", err);
    }

    // 3) Subjects
    const subjectNames = ["Mathematics", "English", "Science", "History", "Geography"];
    const subjects = [];
    try {
        if (models.Subject) {
            for (const name of subjectNames) {
                const s = await models.Subject.create({ name });
                subjects.push(s);
            }
            console.log("Created subjects:", subjectNames.join(", "));
        }
    } catch (err) {
        console.error("Failed to create subjects:", err);
    }

    // 4) Students
    const students = [];
    try {
        if (models.Student) {
            const sampleStudents = [
                { name: "Tariro Chipo", grade: "Grade 7", section: "A", gender: "Female" },
                { name: "Tawanda Nyasha", grade: "Grade 7", section: "A", gender: "Male" },
                { name: "Rudo M", grade: "Grade 7", section: "A", gender: "Female" },
                { name: "Peter K", grade: "Grade 7", section: "B", gender: "Male" },
                { name: "Linda S", grade: "Grade 7", section: "B", gender: "Female" },
                { name: "Simon T", grade: "Grade 7", section: "B", gender: "Male" },
            ];
            for (const s of sampleStudents) {
                const slug = `${slugify(s.name)}-${Math.floor(Math.random() * 900 + 100)}`;
                const st = await models.Student.create({
                    name: s.name,
                    grade: s.grade,
                    section: s.section,
                    gender: s.gender,
                    slug,
                });
                students.push(st);
            }
            console.log(`Created ${students.length} students.`);
        }
    } catch (err) {
        console.error("Failed to create students:", err);
    }

    // 5) SubjectAllocations
    const allocations = [];
    try {
        if (models.SubjectAllocation && (class7A || class7B)) {
            const allocsToCreate = [
                {
                    classId: class7A ? class7A._id : null,
                    subject: "Mathematics",
                    paper: 1,
                    teacherId: teacherAlice ? teacherAlice._id : null,
                },
                {
                    classId: class7A ? class7A._id : null,
                    subject: "English",
                    paper: 1,
                    teacherId: teacherBob ? teacherBob._id : null,
                },
                {
                    classId: class7A ? class7A._id : null,
                    subject: "Science",
                    paper: 2,
                    teacherId: teacherAlice ? teacherAlice._id : null,
                },
                {
                    classId: class7B ? class7B._id : null,
                    subject: "Mathematics",
                    paper: 1,
                    teacherId: teacherBob ? teacherBob._id : null,
                },
                {
                    classId: class7B ? class7B._id : null,
                    subject: "English",
                    paper: 1,
                    teacherId: teacherAlice ? teacherAlice._id : null,
                },
            ];

            for (const a of allocsToCreate) {
                if (!a.classId) continue;
                const doc = await models.SubjectAllocation.create(a);
                allocations.push(doc);
            }
            console.log(`Created ${allocations.length} subject allocations.`);
        }
    } catch (err) {
        console.error("Failed to create subject allocations:", err);
    }

    // 6) One ExamPeriod
    let examPeriod = null;
    try {
        if (models.ExamPeriod) {
            const s = new Date();
            s.setDate(s.getDate() - 14);
            const e = new Date(s);
            e.setDate(s.getDate() + 7);
            examPeriod = await models.ExamPeriod.create({
                name: "End Term 1",
                term: "Term 1",
                startDate: s,
                endDate: e,
                totalDays: 7,
                active: true,
            });
            console.log("Created exam period:", examPeriod.name);
        }
    } catch (err) {
        console.error("Failed to create exam period:", err);
    }

    // 7) Marks
    const marks = [];
    try {
        if (models.Mark && examPeriod && allocations.length && students.length) {
            for (const student of students) {
                const classAlloc = allocations.filter((a) => {
                    return String(a.classId) === String(class7A?._id) && student.section === "A"
                        ? true
                        : String(a.classId) === String(class7B?._id) && student.section === "B"
                            ? true
                            : false;
                });

                const usedAlloc = classAlloc.length ? classAlloc : allocations.filter((a) => String(a.classId) === String(class7A?._id));
                for (const alloc of usedAlloc) {
                    const totalMarks = 100;
                    const markVal = Math.floor(35 + Math.random() * 60);
                    const percentage = Number(((markVal / totalMarks) * 100).toFixed(2));
                    const behaviourGrade = markVal >= 80 ? "A" : markVal >= 65 ? "B" : markVal >= 50 ? "C" : "D";
                    const paperLabel = `Paper ${alloc.paper || 1}`;
                    const m = await models.Mark.create({
                        studentId: student._id,
                        subjectAllocId: alloc._id,
                        examPeriodId: examPeriod._id,
                        paper: paperLabel,
                        mark: markVal,
                        totalMarks,
                        percentage,
                        behaviorGrade: behaviourGrade,
                        periodTest: Math.floor(Math.random() * 100),
                    });
                    marks.push(m);
                }
            }
            console.log(`Inserted ${marks.length} mark documents.`);
        }
    } catch (err) {
        console.error("Failed to create marks:", err);
    }

    // 8) SubjectAssessments
    const subjectAssessments = [];
    try {
        if (models.SubjectAssessment && examPeriod && allocations.length && students.length) {
            for (const student of students) {
                const alloc = allocations[Math.floor(Math.random() * allocations.length)];
                const behaviorGrade = camGradePick(Math.floor(Math.random() * 7));
                const periodTest = Math.floor(30 + Math.random() * 70);
                const sa = await models.SubjectAssessment.create({
                    studentId: student._id,
                    subjectAllocId: alloc._id,
                    examPeriodId: examPeriod._id,
                    behaviorGrade,
                    periodTest,
                });
                subjectAssessments.push(sa);
            }
            console.log(`Inserted ${subjectAssessments.length} subject assessments.`);
        }
    } catch (err) {
        console.error("Failed to create subject assessments:", err);
    }

    // 9) CambridgeCharacteristic
    const characteristics = [];
    try {
        if (models.CambridgeCharacteristic && students.length) {
            let i = 0;
            for (const student of students) {
                const doc = await models.CambridgeCharacteristic.create({
                    studentId: student._id,
                    punctuality: camGradePick(i + 1),
                    behaviour: camGradePick(i + 2),
                    dressing: camGradePick(i + 3),
                    attendance: camGradePick(i + 4),
                    academicYear: "2024",
                    session: "Term 1",
                });
                characteristics.push(doc);
                i++;
            }
            console.log(`Inserted ${characteristics.length} Cambridge characteristics.`);
        }
    } catch (err) {
        console.error("Failed to create Cambridge characteristics:", err);
    }

    // 10) Attendance
    const attendanceRows = [];
    try {
        if (models.Attendance && students.length) {
            for (const student of students) {
                const daysPresent = Math.floor(120 + Math.random() * 30);
                const a = await models.Attendance.create({
                    studentId: student._id,
                    daysPresent,
                });
                attendanceRows.push(a);
            }
            console.log(`Inserted ${attendanceRows.length} attendance records.`);
        }
    } catch (err) {
        console.error("Failed to create attendance records:", err);
    }

    // 11) Comments
    const commentDocs = [];
    try {
        if (models.Comment && students.length) {
            const commentSamples = [
                { type: "classteacher", text: "Shows steady improvement in class." },
                { type: "subject", text: "Excellent engagement in practical lessons." },
                { type: "admin", text: "Needs to submit parents' consent form." },
            ];
            for (let i = 0; i < students.length; i++) {
                const c = commentSamples[i % commentSamples.length];
                const doc = await models.Comment.create({
                    studentId: students[i]._id,
                    subjectAllocId: allocations[i % allocations.length]?._id || null,
                    type: c.type,
                    text: c.text,
                });
                commentDocs.push(doc);
            }
            console.log(`Inserted ${commentDocs.length} comments.`);
        }
    } catch (err) {
        console.error("Failed to create comments:", err);
    }

    // Summary
    console.log("----- SEED SUMMARY -----");
    try {
        const counts = {};
        for (const [k, M] of Object.entries(models)) {
            if (!M) continue;
            try {
                counts[k] = await M.countDocuments();
            } catch (e) {
                counts[k] = "err";
            }
        }
        console.table(counts);
    } catch (err) {
        console.warn("Could not tabulate counts:", err);
    }

    console.log("Seeding complete. Disconnecting.");
    await mongoose.disconnect();
    console.log("Disconnected. Done.");
}

// run
seed().catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
});
