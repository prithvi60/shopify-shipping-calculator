// app/shipping/couriers/fedex.js
import prisma from '../../db.server.js';

// default values if nothing in DB yet
const defaultConfig = {
  dryIceCostPerKg:   0,
  dryIceVolumePerKg: 0,
  freshIcePerDay:    0,
  frozenIcePerDay:   0,
  wineSurcharge:     0,
  volumetricDivisor: 5000,
  fuelSurchargePct:  0,
  vatPct:            22,
  transitDays:       3,
};

export async function loadFedexConfigAndRates() {
  const courier = await prisma.courier.findFirst({ where: { name: 'FedEx' } });
  if (!courier) {
    return { config: { ...defaultConfig }, brackets: [] };
  }
  const cfg = await prisma.config.findFirst({ where: { courierId: courier.id } }) || {};
  const brackets = await prisma.weightBracket.findMany({
    where: { courierId: courier.id },
    orderBy: { minWeightKg: 'asc' },
    include: { rates: { include: { zone: true } } }
  });
  return {
    config: {
      courierId:   courier.id,
      name:        courier.name,
      description: courier.description || '',
      ...defaultConfig,
      ...cfg,
    },
    brackets
  };
}

export async function calculateFedex({ cartItems, config, brackets, transitDays }) {
  console.log('calculateFedex',brackets);
  // — Step 1: total volumes per category (m³)
  const volByCat = cartItems.reduce((acc, { category, dimensions, quantity }) => {
    // user‑provided volume is already in m³
    const vol = (dimensions.volume ||
                 (dimensions.depth * dimensions.width * dimensions.height) / 1_000_000)
                * quantity;
    acc[category] = (acc[category] || 0) + vol;
    return acc;
  }, {});

  // — Step 2: total actual weight (kg)
  const realWeight = cartItems.reduce((sum, { weight, quantity }) =>
    sum + weight * quantity, 0);

  // — Step 3: total volumetric weight (kg)
  const totalVolM3 = Object.values(volByCat).reduce((a, b) => a + b, 0);
  const volumetricWeight = (totalVolM3 * 1_000_000) / config.volumetricDivisor;

  // — Step 4: shipping weight
  const shippingWeight = Math.max(realWeight, volumetricWeight);

  // — Step 5: determine zone from the first item’s postalCode
  const postalCode = cartItems[0]?.postalCode;
  const zoneRecord = postalCode
    ? await prisma.zone.findFirst({
        where: {
          courierId: config.courierId,
          type:      'ZIP',
          value:     postalCode
        }
      })
    : null;
  const zoneValue = zoneRecord?.value;

  // — Step 6: look up base rate from your brackets
  const bracket = brackets.find(br =>
    shippingWeight >= br.minWeightKg && shippingWeight <= br.maxWeightKg
  );
  const rateEntry = bracket?.rates.find(r => r.zone.value === zoneValue);
  const baseRate = rateEntry?.baseRate ?? 2;

  // — Step 7: select containers for total volume
  const containers = await prisma.container.findMany({
    where: { courierId: config.courierId }
  });
  const available = containers.map(c => ({
    id:            c.id,
    name:          c.name,
    volume:        c.maxVolumeM3,
    weight:        c.weightKg,
    cost_excl_vat: c.costVatExcluded,
    cost_incl_vat: c.costVatIncluded
  }));
  // naive first‑fit by totalVol
  let remVol = totalVolM3;
  const containerPlan = [];
  for (const box of available.sort((a, b) => b.volume - a.volume)) {
    while (remVol > 0) {
      remVol -= box.volume;
      containerPlan.push(box);
    }
  }

  // — Step 8: compute dry‑ice cost
  const weightByCat = cartItems.reduce((acc, { weight, quantity, category }) => {
    acc[category] = (acc[category] || 0) + weight * quantity;
    return acc;
  }, {});
  const freshIceKg  = (weightByCat.fresh  || 0) * config.freshIcePerDay  * transitDays;
  const frozenIceKg = (weightByCat.frozen || 0) * config.frozenIcePerDay * transitDays;
  const iceCost     = (freshIceKg + frozenIceKg) * config.dryIceCostPerKg;

  // — Step 9: wine surcharge
  const wineCost = (weightByCat.wine || 0) * config.wineSurcharge;

  // — Step 10: subtotal before fuel & VAT
  const containersCost = containerPlan.reduce((sum, c) => sum + c.cost_incl_vat, 0);
  let subtotal = baseRate + containersCost + iceCost + wineCost;

  // — Step 11: fuel surcharge
  subtotal += subtotal * (config.fuelSurchargePct / 100);

  // — Step 12: VAT
  const totalStandard = subtotal * (1 + config.vatPct / 100);

  // — Step 13: optional time‑slot fee
  const before10Surcharge = 5; // flat, or pull from config
  const quotes = [
    {
      name:        'FedEx Before 10:00',
      code:        'FEDEX_BEFORE_10',
      total:       totalStandard + before10Surcharge,
      currency:    'EUR',
      description: `Standard €${totalStandard.toFixed(2)} + before‑10 surcharge €${before10Surcharge.toFixed(2)}`
    },
    {
      name:        'FedEx Standard',
      code:        'FEDEX_STANDARD',
      total:       totalStandard,
      currency:    'EUR',
      description: [
        `Base €${baseRate.toFixed(2)}`,
        `containers €${containersCost.toFixed(2)}`,
        `ice €${iceCost.toFixed(2)}`,
        `wine €${wineCost.toFixed(2)}`,
        `fuel & VAT`
      ].join(', ')
    }
  ];

  return quotes;
}
