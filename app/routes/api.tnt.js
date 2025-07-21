import { json } from '@remix-run/node';
import prisma from '../db.server.js';

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
  if (!courier) return json({ config: defaultConfig, rates: [] });

  const cfg = await prisma.config.findFirst({ where: { courierId: courier.id } }) || {};

  // When fetching, we need to include the related 'rates' to get the baseRate
  const brackets = await prisma.weightBracket.findMany({
    where: { courierId: courier.id },
    include: {
      rates: { // Include the related rates
        select: { baseRate: true }, // Select 'baseRate' as per the schema
      }
    },
    orderBy: { minWeightKg: 'asc' }
  });

  const rates = brackets.map(br => ({
    weight: br.minWeightKg === br.maxWeightKg
      ? `${br.minWeightKg}`
      : br.maxWeightKg === 999999 // Check for the "greater than" representation
        ? `>${br.minWeightKg}`
        : `${br.minWeightKg}-${br.maxWeightKg}`,
    // Access the baseRate from the nested rates array
    price: br.rates && br.rates.length > 0 ? br.rates[0].baseRate?.toString() || '' : ''
  }));

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
  const rawRates  = form.get('rates'); // This now contains the transformed rates from the frontend

  if (!rawConfig || !rawRates) {
    return json({ success: false, error: 'Missing payload' }, { status: 400 });
  }

  let cfg, rows;
  try {
    cfg  = JSON.parse(rawConfig);
    rows = JSON.parse(rawRates); // 'rows' now contains objects with minWeightKg, maxWeightKg, and nested 'rates'
  } catch (e) {
    console.error("JSON parsing error:", e);
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

  // Strip extras
  const { name, description, rates: frontendRates, ...nums } = cfg; // Destructure 'rates' to avoid conflict

  // Upsert config
  await prisma.config.upsert({
    where:  { courierId: courier.id },
    create: { courierId: courier.id, ...nums },
    update: { ...nums }
  });

  // Ensure a default zone exists for TNT, as Rate requires a zoneId
  let defaultZone = await prisma.zone.findFirst({
    where: {
      courierId: courier.id,
      value: 'DEFAULT_TNT_ZONE', // A unique identifier for the default zone for TNT
      type: 'COUNTRY' // Assuming a default type for this zone
    }
  });

  if (!defaultZone) {
    defaultZone = await prisma.zone.create({
      data: {
        courierId: courier.id,
        value: 'DEFAULT_TNT_ZONE',
        type: 'COUNTRY',
        transitDays: nums.transitDays // Use transitDays from the config
      }
    });
  }

  // Clear old brackets and their associated rates
  // First, delete rates associated with these brackets to avoid foreign key constraints
  const existingBracketIds = (await prisma.weightBracket.findMany({
    where: { courierId: courier.id },
    select: { id: true }
  })).map(b => b.id);

  if (existingBracketIds.length > 0) {
    await prisma.rate.deleteMany({
      where: { bracketId: { in: existingBracketIds } }
    });
  }
  // Then, delete the brackets themselves
  await prisma.weightBracket.deleteMany({ where: { courierId: courier.id } });


  // Insert new brackets with nested rates
  // Use Promise.allSettled to handle potential individual errors without stopping the whole process
  const results = await Promise.allSettled(rows.map(row => {
    // 'row' now directly contains minWeightKg, maxWeightKg, and the nested rates object
    const { minWeightKg, maxWeightKg, rates: nestedRates } = row;

    // Validate if minWeightKg and maxWeightKg are valid numbers
    if (isNaN(minWeightKg) || isNaN(maxWeightKg)) {
      console.warn(`Skipping invalid weight bracket: minWeightKg=${minWeightKg}, maxWeightKg=${maxWeightKg}`);
      return Promise.resolve(null); // Resolve with null for invalid entries
    }

    // Ensure nestedRates.create and nestedRates.create.price exist
    if (!nestedRates || !nestedRates.create || typeof nestedRates.create.price === 'undefined') {
      console.warn(`Skipping weight bracket due to missing price: ${JSON.stringify(row)}`);
      return Promise.resolve(null); // Resolve with null if price is missing
    }

    return prisma.weightBracket.create({
      data: {
        courierId: courier.id,
        minWeightKg: minWeightKg,
        maxWeightKg: maxWeightKg,
        rates: { // This is the key change to match Prisma's schema
          create: {
            baseRate: nestedRates.create.price, // Map frontend 'price' to backend 'baseRate'
            zoneId: defaultZone.id // Associate with the default zone
          }
        }
      }
    });
  }));

  // Log any rejections from Promise.allSettled for debugging
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Failed to create weight bracket at index ${index}:`, result.reason);
    }
  });

  return json({ success: true });
};
