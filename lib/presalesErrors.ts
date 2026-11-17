import { NextResponse } from 'next/server';

export function presalesError(error: { code?: string; message?: string }) {
  const status = error.code === '40001' || error.code === '23505' ? 409
    : error.code === '42501' ? 403 : error.code === 'P0002' ? 404
      : ['22023','23514','23503'].includes(error.code || '') ? 400 : 500;
  return NextResponse.json({ success: false,
    message: status === 500 ? 'Não foi possível guardar Presales.' : error.message || 'Operação inválida.' }, { status });
}
