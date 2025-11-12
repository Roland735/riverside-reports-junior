// app/api/classes/init/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import Student from '@/models/Student';
import Class from '@/models/Class';

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await dbConnect();

    // find every unique grade/section in Student
    const combos = await Student.aggregate([
        { $group: { _id: { grade: '$grade', section: '$section' } } }
    ]);

    console.log(combos);


    // for each combo, only create if one doesn't already exist
    await Promise.all(combos.map(async ({ _id: { grade, section } }) => {
        const exists = await Class.exists({ grade, section });
        if (!exists) {
            await Class.create({ grade, section });
        }
    }));

    // return all classes
    const classes = await Class.find().populate('classTeacherId', 'name');
    return NextResponse.json({ classes });
}
