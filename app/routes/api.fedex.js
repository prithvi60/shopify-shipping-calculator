// app/routes/api.fedex.js
import { json } from '@remix-run/node';
import prisma from '../db.server';

// must exactly match your Zone.value in the DB
const zoneLabels = [
  'ZONA A','ZONA B','ZONA C',
  'ZONA D','ZONA E','ZONA F',
  'ZONA G','ZONA H','ZONA I'
];

// default config when FedEx isn’t yet in the DB
const defaultConfig = {
  dryIceCostPerKg:   0,
  dryIceVolumePerKg: 0,
  freshIcePerDay:    0,
  frozenIcePerDay:   0,
  wineSurcharge:     0,
  volumetricDivisor: 5000,
  fuelSurchargePct:  0,
  vatPct:            0,
  transitDays:       3
};

export const loader = async () => {
  // 1️⃣ find FedEx courier
  const courier = await prisma.courier.findFirst({ where: { name: 'FedEx' } });
  if (!courier) {
    return json({ config: defaultConfig, rates: [] });
  }

  // 2️⃣ load its config (or empty)
  const cfg = await prisma.config.findFirst({ where: { courierId: courier.id } }) || {};

  // 3️⃣ load brackets + rates
  const brackets = await prisma.weightBracket.findMany({
    where: { courierId: courier.id },
    orderBy: { minWeightKg: 'asc' },
    include: { rates: { include: { zone: true } } }
  });

  // 4️⃣ flatten for UI
  const rates = brackets.map(br => {
    const min    = br.minWeightKg;
    const max    = br.maxWeightKg;
    const weight = min === max ? `${min}` : `${min}-${max}`;
    const row    = { weight };
    // initialize blanks
    for (const lbl of zoneLabels) {
      row[lbl.replace(/\s+/g, '_')] = '';
    }
    // fill existing
    for (const rate of br.rates) {
      const key = rate.zone.value.replace(/\s+/g, '_');
      if (row.hasOwnProperty(key)) row[key] = String(rate.baseRate);
    }
    return row;
  });

  return json({
    config: {
      name:        courier.name,
      description: courier.description || '',
      ...defaultConfig,
      ...cfg,
      transitDays: cfg.transitDays ?? defaultConfig.transitDays
    },
    rates
  });
};

export const action = async ({ request }) => {
  const form      = await request.formData();
  const rawConfig = form.get('config');
  const rawRates  = form.get('rates');

  if (!rawConfig || !rawRates) {
    return json({ success: false, error: 'Missing config or rates payload' }, { status: 400 });
  }

  let fullConfig, rows;
  try {
    fullConfig = JSON.parse(rawConfig);
    rows       = JSON.parse(rawRates);
  } catch {
    return json({ success: false, error: 'Invalid JSON for config or rates' }, { status: 400 });
  }

  // ① Upsert the FedEx courier
  let courier = await prisma.courier.findFirst({ where: { name: 'FedEx' } });
  if (!courier) {
    courier = await prisma.courier.create({
      data: {
        name:        'FedEx',
        description: fullConfig.description
      }
    });
  } else {
    await prisma.courier.update({
      where: { id: courier.id },
      data:  { description: fullConfig.description }
    });
  }

  // ② Strip out name/description/rates before updating Config
  const {
    name, description, rates, /* discard */
    ...cfgNumbers            /* keep only the numeric fields */
  } = fullConfig;

  await prisma.config.upsert({
    where:  { courierId: courier.id },
    create: { courierId: courier.id, ...cfgNumbers },
    update: { ...cfgNumbers }
  });

  // ③ Ensure your 9 zones exist (with required type+transitDays)
  let zones = await prisma.zone.findMany({ where: { courierId: courier.id } });
  if (zones.length === 0) {
    zones = await Promise.all(zoneLabels.map(lbl =>
      prisma.zone.create({
        data: {
          courierId:   courier.id,
          value:       lbl,
          type:        'COUNTRY',               // adjust ZoneType if needed
          transitDays: cfgNumbers.transitDays
        }
      })
    ));
  }
  const zoneMap = Object.fromEntries(zones.map(z => [z.value, z.id]));

  // ④ Clear old brackets & rates
  await prisma.rate.deleteMany({ where: { bracket: { courierId: courier.id } } });
  await prisma.weightBracket.deleteMany({ where: { courierId: courier.id } });

  // ⑤ Recreate brackets + rates
  for (const r of rows) {
    const parts = r.weight.split('-').map(s => parseFloat(s.replace(',', '.')));
    const min   = parts[0];
    const max   = !isNaN(parts[1]) ? parts[1] : parts[0];

    const bracket = await prisma.weightBracket.create({
      data: { courierId: courier.id, minWeightKg: min, maxWeightKg: max }
    });

    const tasks = zoneLabels.map(lbl => {
      const key      = lbl.replace(/\s+/g, '_');
      const rawVal   = (r[key] ?? '').toString().replace(',', '.');
      const baseRate = parseFloat(rawVal);
      const zoneId   = zoneMap[lbl];
      if (!zoneId || isNaN(baseRate)) return null;
      return prisma.rate.create({
        data: { bracketId: bracket.id, zoneId, baseRate }
      });
    }).filter(x => x);

    await Promise.all(tasks);
  }

  return json({ success: true });
};
