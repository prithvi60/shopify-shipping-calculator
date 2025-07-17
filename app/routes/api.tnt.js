import { json } from '@remix-run/node';
import prisma      from '../db.server.js';

// Must match your tnt.js zoneLabels
const zoneLabels = [
  'ZONA 1','ZONA 2','ZONA 3',
  'ZONA 4','ZONA 5','ZONA 6',
  'ZONA 7','ZONA 8','ZONA 9'
];

const defaultConfig = {
  volumetricDivisor: 5000,
  weightRounding:    0.5,
  dryIceCostPerKg:   0,
  dryIceVolumePerKg: 0,
  freshIcePerDay:    0,
  frozenIcePerDay:   0,
  wineSurcharge:     0,
  fuelSurchargePct:  0,
  vatPct:            0,
  transitDays:       3,
};

export const loader = async () => {
  const courier = await prisma.courier.findFirst({ where: { name: 'TNT' } });
  if (!courier) {
    return json({ config: defaultConfig, rates: [] });
  }

  const cfg = await prisma.config.findFirst({ where: { courierId: courier.id } }) || {};
  const brackets = await prisma.weightBracket.findMany({
    where: { courierId: courier.id },
    orderBy: { minWeightKg: 'asc' },
    include: { rates: { include: { zone: true } } }
  });

  const rates = brackets.map(br => {
    const weight = br.minWeightKg === br.maxWeightKg
      ? String(br.minWeightKg)
      : `${br.minWeightKg}-${br.maxWeightKg}`;
    const row = { weight };
    zoneLabels.forEach(lbl => row[lbl.replace(' ', '_')] = '');
    br.rates.forEach(r => {
      const key = r.zone.value.replace(' ', '_');
      row[key] = String(r.baseRate);
    });
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
    return json({ success: false, error: 'Missing payload' }, { status: 400 });
  }

  let cfg, rows;
  try {
    cfg  = JSON.parse(rawConfig);
    rows = JSON.parse(rawRates);
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Upsert courier
  let courier = await prisma.courier.findFirst({ where: { name: 'TNT' } });
  if (!courier) {
    courier = await prisma.courier.create({
      data: { name: 'TNT', description: cfg.description }
    });
  } else {
    await prisma.courier.update({
      where: { id: courier.id },
      data:  { description: cfg.description }
    });
  }

  // Strip name/desc/rates
  const { name, description, rates, ...nums } = cfg;

  // Upsert config
  await prisma.config.upsert({
    where:  { courierId: courier.id },
    create: { courierId: courier.id, ...nums },
    update: { ...nums }
  });

  // Ensure zones exist
  let zones = await prisma.zone.findMany({ where: { courierId: courier.id } });
  if (!zones.length) {
    zones = await Promise.all(zoneLabels.map(lbl =>
      prisma.zone.create({
        data: {
          courierId:   courier.id,
          value:       lbl,
          type:        'ZIP',
          transitDays: nums.transitDays
        }
      })
    ));
  }
  const zoneMap = Object.fromEntries(zones.map(z => [z.value, z.id]));

  // Clear old
  await prisma.rate.deleteMany({ where: { bracket: { courierId: courier.id } } });
  await prisma.weightBracket.deleteMany({ where: { courierId: courier.id } });

  // Recreate brackets + rates
  for (const r of rows) {
    const parts   = r.weight.split('-').map(parseFloat);
    const min     = parts[0];
    const max     = isNaN(parts[1]) ? min : parts[1];
    const bracket = await prisma.weightBracket.create({
      data: { courierId: courier.id, minWeightKg: min, maxWeightKg: max }
    });
    const tasks = zoneLabels.map(lbl => {
      const key = lbl.replace(' ', '_');
      const val = parseFloat((r[key]||'').replace(',', '.'));
      const zid = zoneMap[lbl];
      return (!isNaN(val) && zid)
        ? prisma.rate.create({ data: { bracketId: bracket.id, zoneId: zid, baseRate: val } })
        : null;
    }).filter(Boolean);
    await Promise.all(tasks);
  }

  return json({ success: true });
};
