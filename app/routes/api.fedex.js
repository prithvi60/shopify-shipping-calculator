// app/routes/api.fedex.js
import { json } from '@remix-run/node';
import prisma from '../db.server';

// Zone labels must match your Zone.value entries for FedEx
const zoneLabels = [
  'ZONA A','ZONA B','ZONA C',
  'ZONA D','ZONA E','ZONA F',
  'ZONA G','ZONA H','ZONA I'
];

// default config for initial empty state
const defaultConfig = {
  dryIceCostPerKg:   0,
  dryIceVolumePerKg: 0,
  freshIcePerDay:    0,
  frozenIcePerDay:   0,
  wineSurcharge:     0,
  volumetricDivisor: 5000,
  fuelSurchargePct:  0,
  vatPct:            0,
};

export const loader = async () => {
  // 1️⃣ Try to find FedEx courier
  const courier = await prisma.courier.findFirst({
    where: { name: 'FedEx' }
  });

  // 2️⃣ If not yet configured, return empty defaults
  if (!courier) {
    return json({ config: defaultConfig, rates: [] });
  }

  // 3️⃣ Load its config (or fallback)
  const config = await prisma.config.findFirst({
    where: { courierId: courier.id }
  }) || defaultConfig;

  // 4️⃣ Load all weight brackets + their rates
  const brackets = await prisma.weightBracket.findMany({
    where: { courierId: courier.id },
    orderBy: { minWeightKg: 'asc' },
    include: { rates: { include: { zone: true } } }
  });

  // 5️⃣ Transform into flat rows
  const rates = brackets.map(br => {
    const row = { weight: `${br.minWeightKg}-${br.maxWeightKg}` };
    for (const rate of br.rates) {
      row[rate.zone.value] = String(rate.baseRate);
    }
    return row;
  });

  return json({ config, rates });
};

export const action = async ({ request }) => {
  const form      = await request.formData();
  const rawConfig = form.get('config');
  const rawRates  = form.get('rates');

  if (!rawConfig || !rawRates) {
    return json({ success: false, error: 'Missing config or rates payload' }, { status: 400 });
  }

  let configData, rows;
  try {
    configData = JSON.parse(rawConfig);
    rows       = JSON.parse(rawRates);
  } catch {
    return json({ success: false, error: 'Invalid JSON for config or rates' }, { status: 400 });
  }

  // 1️⃣ Find or create FedEx courier
  let courier = await prisma.courier.findFirst({ where: { name: 'FedEx' } });
  if (!courier) {
    courier = await prisma.courier.create({ data: { name: 'FedEx' } });
  }

  // 2️⃣ Upsert config for FedEx
  await prisma.config.upsert({
    where: { courierId: courier.id },
    create: { courierId: courier.id, ...configData },
    update: { ...configData }
  });

  // 3️⃣ Wipe & rebuild brackets + rates
  await prisma.rate.deleteMany({ where: { bracket: { courierId: courier.id } } });
  await prisma.weightBracket.deleteMany({ where: { courierId: courier.id } });

  // 4️⃣ Cache zone IDs
  const zones = await prisma.zone.findMany({ where: { courierId: courier.id } });
  const zoneMap = zones.reduce((m, z) => { m[z.value] = z.id; return m; }, {});

  // 5️⃣ Recreate weight brackets + rates
  for (const r of rows) {
    const [min, max] = r.weight.split('-').map(Number);
    const bracket = await prisma.weightBracket.create({
      data: { courierId: courier.id, minWeightKg: min, maxWeightKg: max }
    });

    const creates = zoneLabels.map(label => {
      const zoneId = zoneMap[label];
      const val    = parseFloat(r[label] ?? '');
      if (!zoneId || isNaN(val)) return null;
      return prisma.rate.create({
        data: { bracketId: bracket.id, zoneId, baseRate: val }
      });
    }).filter(Boolean);

    await Promise.all(creates);
  }

  return json({ success: true });
};
