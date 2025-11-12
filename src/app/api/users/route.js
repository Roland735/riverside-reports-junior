// app/api/users/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import User from '@/models/User';

export async function GET(request) {
    // only admin may list users
    const session = await getServerSession(authOptions);
    if (!session?.user?.role || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const url = new URL(request.url);
    const role = url.searchParams.get('role'); // e.g. ?role=teacher

    const query = {};
    if (role) query.role = role;

    const users = await User.find(query).select('name email role');
    return NextResponse.json({ users });
}
