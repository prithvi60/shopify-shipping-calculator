import prisma from '../../db.server.js';

// **HARD‑CODED** zone labels exactly as per your TNT Excel
export const zoneLabels = [
  'ZONA 1','ZONA 2','ZONA 3',
  'ZONA 4','ZONA 5','ZONA 6',
  'ZONA 7','ZONA 8','ZONA 9'
];

const defaultConfig = {
  volumetricDivisor: 5000,
  weightRounding:    0.5,    // TNT rounds up to nearest 0.5 kg
  dryIceCostPerKg:   0,
  dryIceVolumePerKg: 0,
  freshIcePerDay:    0,
  frozenIcePerDay:   0,
  wineSurcharge:     0,
  fuelSurchargePct:  0,
  vatPct:            0,
  transitDays:       3,
};

export async function loadTntConfigAndRates() {
  const courier = await prisma.courier.findFirst({ where: { name: 'TNT' } });
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
      ...cfg
    },
    brackets
  };
}

export async function calculateTnt({ cartItems, config, brackets, transitDays }) {
  // 1) actual weight
  const realWeight = cartItems.reduce((sum, { weight, quantity }) =>
    sum + weight * quantity, 0);

  // 2) volumetric weight (m³ → cm³ / divisor)
  const totalVolM3 = cartItems.reduce((sum, { dimensions, quantity }) =>
    sum + ((dimensions.volume ||
            (dimensions.depth * dimensions.width * dimensions.height) / 1e6)
           * quantity), 0);
  const volumetricWeight = (totalVolM3 * 1e6) / config.volumetricDivisor;

  // 3) shipping weight (max + round up)
  let shipW = Math.max(realWeight, volumetricWeight);
  shipW = Math.ceil(shipW / config.weightRounding) * config.weightRounding;

  // 4) zone from postalCode of first item
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

  // 5) bracket & baseRate lookup
  const bracket = brackets.find(b =>
    shipW >= b.minWeightKg && shipW <= b.maxWeightKg
  );
  const rateEntry = bracket?.rates.find(r => r.zone.value === zoneValue);
  const baseRate  = rateEntry?.baseRate ?? 0;

  return {
    name:        'TNT Standard',
    code:        'TNT_STANDARD',
    total:       baseRate,
    currency:    'EUR',
    description: `ShipW ${shipW} kg → [${bracket?.minWeightKg}-${bracket?.maxWeightKg}] @ ${zoneValue}: €${baseRate.toFixed(2)}`
  };
}
