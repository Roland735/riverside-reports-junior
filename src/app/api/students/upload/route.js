// src/app/api/students/upload/route.js
import { NextResponse } from 'next/server';
import { utils, read } from 'xlsx';
import dbConnect from '@/lib/mongoose';
import Student from '@/models/Student';

export const POST = async (req) => {
    try {
        const formData = await req.formData();
        const file = formData.get('file');
        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Read buffer directly
        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = utils.sheet_to_json(workbook.Sheets[sheetName]);

        // Connect and insert
        await dbConnect();
        const students = rows.map((row) => ({
            name: row.name || '',
            grade: row.grade || '',
            section: row.section || '',
            gender: row.gender || '',
            slug:
                (row.name || '')
                    .toString()
                    .toLowerCase()
                    .replace(/\s+/g, '-') +
                '-' +
                Math.floor(Math.random() * 10000),
        }));
        await Student.insertMany(students);

        return NextResponse.json({ message: 'Students uploaded successfully!' });
    } catch (err) {
        console.error(err);
        return NextResponse.json(
            { error: 'Failed to process file' },
            { status: 500 }
        );
    }
};
