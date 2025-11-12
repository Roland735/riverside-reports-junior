// src/app/api/dashboard/classteacher/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongoose";
import ClassModel from "@/models/Class";

export async function GET(req) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    await dbConnect();
    const classes = await ClassModel
        .find({ classTeacherId: session.user.id })
        .select("_id grade section averagePercent")
        .lean();
    return NextResponse.json({ classes });
}
