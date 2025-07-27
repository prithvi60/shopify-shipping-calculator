// File: app/routes/api.brt.js
import { json } from '@remix-run/node';
import  prisma  from '../db.server';


export const loader = async () => {
  // Fetch all regions from the SQLite database
  const regions = await prisma.brtRegion.findMany({ orderBy: { id: 'asc' } });
  return json(regions);
};

export const action = async ({ request }) => {
  // Read JSON data posted from the frontend
  const form = await request.formData();
  const data = form.get('data');
  if (!data) {
    return json({ success: false, error: 'No data provided' }, { status: 400 });
  }
  let regions;
  try {
    regions = JSON.parse(data);
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Upsert each region record into the database
  await Promise.all(
    regions.map((r) =>
      prisma.brtRegion.upsert({
        where: { id: r.id },
        update: { price: r.price.toString() },
        create: {
          id: r.id,
          region: r.region,
          price: r.price.toString(),
        },
      })
    )
  );

  return json({ success: true });
};
