import { NextResponse } from 'next/server';
import { utils, write } from 'xlsx';

export async function GET() {
    // Create a new workbook and a sheet with headers
    const wb = utils.book_new();
    const wsData = [
        ['name', 'email', 'password', 'role'],
        ['Jane Doe', 'jane@example.com', 'changeme', 'teacher'],
    ];
    const ws = utils.aoa_to_sheet(wsData);
    utils.book_append_sheet(wb, ws, 'TeachersTemplate');

    // Write to a Buffer
    const buf = write(wb, { bookType: 'xlsx', type: 'buffer' });

    return new NextResponse(buf, {
        status: 200,
        headers: {
            'Content-Type':
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition':
                'attachment; filename="teachers_template.xlsx"',
        },
    });
}
