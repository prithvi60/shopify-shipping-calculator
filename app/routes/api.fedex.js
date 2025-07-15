import { json } from '@remix-run/node';
import { prisma } from '../db.server';

export const loader = async () => {
  const rates = await prisma.fedexRate.findMany({
    orderBy: { id: 'asc' },
  });
  return json(rates);
};

export const action = async ({ request }) => {
  const form = await request.formData();
  const raw = form.get('data');

  if (!raw) {
    return json({ success: false, error: 'No data received' }, { status: 400 });
  }

  let rows;
  try {
    rows = JSON.parse(raw);
  } catch (err) {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Optional: clear and replace strategy (simpler than row-by-row upsert)
  await prisma.fedexRate.deleteMany({});
  await prisma.fedexRate.createMany({
    data: rows.map((r) => ({
      weight: r.WEIGHT,
      ZONA_A: r['ZONA A']?.toString() || '',
      ZONA_B: r['ZONA B']?.toString() || '',
      ZONA_C: r['ZONA C']?.toString() || '',
      ZONA_D: r['ZONA D']?.toString() || '',
      ZONA_E: r['ZONA E']?.toString() || '',
      ZONA_F: r['ZONA F']?.toString() || '',
      ZONA_G: r['ZONA G']?.toString() || '',
      ZONA_H: r['ZONA H']?.toString() || '',
      ZONA_I: r['ZONA I']?.toString() || '',
    })),
  });

  return json({ success: true });
};
