import { NextRequest, NextResponse } from "next/server";
import { getAllInvoices, getInvoice, deleteInvoice, updateInvoice } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const invoice = getInvoice(Number(id));
    if (!invoice) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  }

  const invoices = getAllInvoices();
  return NextResponse.json({ invoices });
}

export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Se requiere id" }, { status: 400 });
  }

  const body = await request.json();
  updateInvoice(Number(id), body);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Se requiere id" }, { status: 400 });
  }

  deleteInvoice(Number(id));
  return NextResponse.json({ success: true });
}
