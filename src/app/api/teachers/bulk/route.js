import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import User from '@/models/User';
import { utils, read } from 'xlsx';
import bcrypt from 'bcryptjs';

export async function POST(request) {
    await dbConnect();

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Read file into buffer and parse
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = utils.sheet_to_json(sheet);

    const results = [];
    for (const row of rows) {
        const { name, email, password, role } = row;
        if (!name || !email || !password || !role) {
            results.push({ email: email || '(missing)', status: 'skipped' });
            continue;
        }

        const exists = await User.findOne({ email });
        if (exists) {
            results.push({ email, status: 'exists' });
            continue;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = new User({ name, email, passwordHash, role });
        await user.save();
        results.push({ email, status: 'created' });
    }

    return NextResponse.json({ results });
}
