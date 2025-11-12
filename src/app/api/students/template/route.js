import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';

export const GET = async () => {
    const data = [
        { name: 'Jane Doe', grade: 'Grade 6', section: 'A', gender: 'Female' },
        { name: 'John Smith', grade: 'Grade 6', section: 'B', gender: 'Male' },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
        headers: {
            'Content-Type':
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="students-template.xlsx"',
        },
    });
};
