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
  const config = {
    courierId:   courier.id,
    name:        courier.name,
    description: courier.description || '',
    ...defaultConfig,
    ...cfg,
  };
  return { config, brackets };
}

export async function calculateFedex({ cartItems, config, brackets, transitDays }) {
  // 1) volumes
  const volumeByCategory = cartItems.reduce((acc, item) => {
    const vol = (item.dimensions.length * item.dimensions.width * item.dimensions.height) / 1_000_000;
    acc[item.category] = (acc[item.category] || 0) + vol * item.quantity;
    return acc;
  }, {});

  // 2) pack into boxes
  const containers = await prisma.container.findMany({ where: { courierId: config.courierId } });
  const available = containers.map(c => ({
    id:   c.id,
    name: c.name,
    volume:        c.maxVolumeM3,
    weight:        c.weightKg,
    cost_excl_vat: c.costVatExcluded,
    cost_incl_vat: c.costVatIncluded
  }));
  const containerPlan = [];
  for (const volNeeded of Object.values(volumeByCategory)) {
    let rem = volNeeded;
    for (const box of available.sort((a,b)=>b.volume - a.volume)) {
      while (rem > 0) {
        rem -= box.volume;
        containerPlan.push(box);
      }
    }
  }

  // 3) ice
  const weightByCategory = cartItems.reduce((acc, { weight, quantity, category }) => {
    acc[category] = (acc[category] || 0) + weight * quantity;
    return acc;
  }, {});
  const freshIceKg  = (weightByCategory.fresh  || 0) * config.freshIcePerDay  * transitDays;
  const frozenIceKg = (weightByCategory.frozen || 0) * config.frozenIcePerDay * transitDays;
  const iceCost     = (freshIceKg + frozenIceKg) * config.dryIceCostPerKg;

  // 4) base costs
  const containersCost = containerPlan.reduce((sum,c)=>sum + c.cost_incl_vat, 0);
  const wineCost       = (weightByCategory.wine || 0) * config.wineSurcharge;
  let subtotal = containersCost + iceCost + wineCost;

  // 5) fuel surcharge
  subtotal += subtotal * (config.fuelSurchargePct / 100);

  // 6) VAT
  const totalStandard = subtotal * (1 + config.vatPct / 100);

  // build two quotes:
  const standard = {
    name:        'FedEx Standard',
    code:        'FEDEX_STANDARD',
    total:       totalStandard,
    currency:    'EUR',
    description: `Containers €${containersCost.toFixed(2)}, ice €${iceCost.toFixed(2)}, wine €${wineCost.toFixed(2)}`
  };

  // before‐10 surcharge (flat €5)
  const surcharge = 5;
  const totalBefore10 = totalStandard + surcharge;
  const before10 = {
    name:        'FedEx Before 10:00',
    code:        'FEDEX_BEFORE_10',
    total:       totalBefore10,
    currency:    'EUR',
    description: standard.description + ` + before‐10 surcharge €${surcharge.toFixed(2)}`
  };

  // return both options
  return [before10, standard];
}
