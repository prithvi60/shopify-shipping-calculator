import prisma from '../../db.server.js';

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

export async function loadConfigAndRates() {
  const courier = await prisma.courier.findFirst({ where: { name: 'TNT' } });
  if (!courier) {
    return { config: { ...defaultConfig }, brackets: [], zones: [] };
  }
  const cfg = await prisma.config.findFirst({ where: { courierId: courier.id } }) || {};

  const brackets = await prisma.weightBracket.findMany({
    where: { courierId: courier.id },
    orderBy: { minWeightKg: 'asc' },
    include: {
      rates: {
        include: { zone: true }
      }
    }
  });

  const zones = await prisma.zone.findMany({
      where: { courierId: courier.id }
  });

  // Load TimeSlotFees for the courier
  const timeSlotFees = await prisma.timeSlotFee.findMany({
    where: { courierId: courier.id }
  });

  return {
    config: {
      courierId:   courier.id,
      name:        courier.name,
      description: courier.description || '',
      ...defaultConfig,
      ...cfg
    },
    brackets,
    zones,
    timeSlotFees // Include timeSlotFees in the returned object
  };
}

export async function calculate({ cartItems, config, brackets, zones, transitDays, timeSlotFees }) {
  console.log('--- TNT Calculation Start ---');
  console.log('📥 TNT: cartItems:', JSON.stringify(cartItems, null, 2));
  console.log('📥 TNT: config:', JSON.stringify(config, null, 2));
  console.log('📥 TNT: brackets:', JSON.stringify(brackets, null, 2));
  console.log('📥 TNT: zones:', JSON.stringify(zones, null, 2)); // Ensure zones are logged
  console.log('📥 TNT: transitDays:', transitDays);
  console.log('📥 TNT: timeSlotFees:', JSON.stringify(timeSlotFees, null, 2)); // Log timeSlotFees

  // --- Courier Availability Check ---
  // If TNT is only for Italy, check the countryCode of the first item in the cart.
  // You can expand this logic to check for specific provinces, cities, or even item categories.
  const destinationCountryCode = cartItems[0]?.countryCode;
  if (!destinationCountryCode || destinationCountryCode !== 'IT') {
    console.log(`🚫 TNT: Hiding rates because destination country is not Italy (${destinationCountryCode}).`);
    return []; // Return an empty array if TNT is not available for this destination
  }
  // --- End Courier Availability Check ---


  // Step 1: Calculate actual weight
  const realWeight = cartItems.reduce((sum, { weight, quantity }) =>
    sum + weight * quantity, 0);
  console.log('Step 1: Real Weight (kg):', realWeight);

  // Step 2: Calculate volumetric weight
  const totalVolM3 = cartItems.reduce((sum, { dimensions, quantity }) => {
    // Corrected to 1e9 for mm to m3, assuming dimensions.depth, width, height are in mm
    const itemVolumeM3 = dimensions.volume ||
                         (dimensions.depth * dimensions.width * dimensions.height) / 1e9;
    return sum + (itemVolumeM3 * quantity);
  }, 0);
  console.log('Step 2a: Total Volume (m³):', totalVolM3);

  // Convert m3 to cm3 for divisor, then divide by volumetricDivisor
  const volumetricWeight = (totalVolM3 * 1e6) / config.volumetricDivisor;
  console.log('Step 2b: Volumetric Weight (kg):', volumetricWeight);

  // Step 3: Determine shipping weight (max + round up)
  let shipW = Math.max(realWeight, volumetricWeight);
  console.log('Step 3a: Max (Real, Volumetric) Weight (kg):', shipW);

  shipW = Math.ceil(shipW / config.weightRounding) * config.weightRounding;
  console.log('Step 3b: Shipping Weight (rounded up) (kg):', shipW);

  // Step 4: Determine zone - Prioritize DEFAULT_TNT_ZONE for TNT
  let zoneRecord = zones.find(z => z.value === 'DEFAULT_TNT_ZONE');
  const postalCode = cartItems[0]?.postalCode; // Still get postal code if needed for other logic or future expansion

  if (postalCode && !zoneRecord) { // Only try to find by ZIP if no default zone was found (unlikely after action fix)
      // Or if you want ZIP to override default, reverse the order:
      // zoneRecord = await prisma.zone.findFirst({
      //     where: {
      //         courierId: config.courierId,
      //         type: 'ZIP',
      //         value: postalCode
      //     }
      // });
      // console.log('Step 4a: Zone lookup by Postal Code (if no default):', zoneRecord ? zoneRecord.value : 'Not found');
  }

  // If no specific zone found in passed `zones` array, try fetching from DB as a safeguard
  if (!zoneRecord) {
      console.warn('Step 4b: DEFAULT_TNT_ZONE not found in `zones` array. Attempting to fetch from DB.');
      zoneRecord = await prisma.zone.findFirst({
          where: {
              courierId: config.courierId,
              value: 'DEFAULT_TNT_ZONE',
              type: 'COUNTRY'
          }
      });
      if (!zoneRecord) {
          console.error('Step 4b: DEFAULT_TNT_ZONE could not be found in DB. Cannot calculate rates.');
          return []; // Cannot proceed without a zone
      }
  }

  const zoneValue = zoneRecord?.value;
  console.log('Step 4c: Final Zone Value:', zoneValue);

  // Step 5: Bracket & baseRate lookup
  let bracket = brackets.find(b =>
    shipW >= b.minWeightKg && shipW <= b.maxWeightKg
  );
  if (!bracket && brackets.length > 0) {
    bracket = brackets[0];
    console.warn(`Step 5a: No exact matching weight bracket found for ${shipW}kg. Defaulting to the first bracket: ${bracket.minWeightKg}-${bracket.maxWeightKg}`);
  } else if (!bracket && brackets.length === 0) {
    console.error('Step 5a: No weight brackets configured. Cannot calculate rates.');
    return []; // Return empty if no brackets at all
  }

  console.log('Step 5a: Matching Weight Bracket:', bracket ? `${bracket.minWeightKg}-${bracket.maxWeightKg}` : 'No bracket found');

  let baseRate = 0;
  let rateEntry = null;

  if (bracket && zoneValue) {
      // Ensure the rate lookup uses the correct zone (DEFAULT_TNT_ZONE)
      rateEntry = bracket.rates.find(r => r.zone.value === zoneValue);
      baseRate = rateEntry?.baseRate ?? 0;
      console.log('Step 5b: Found Rate Entry for Zone:', rateEntry ? `Base Rate: ${rateEntry.baseRate}` : 'No rate entry for this zone in bracket');
  } else {
      console.log('Step 5b: Cannot find rate entry (missing bracket or zoneValue)');
  }

  console.log('Step 5c: Base Rate (€):', baseRate);

  // Step 6: Apply Fuel Surcharge (if applicable)
  let finalRateStandard = baseRate;
  if (config.fuelSurchargePct > 0) {
      const fuelSurchargeAmount = baseRate * (config.fuelSurchargePct / 100);
      finalRateStandard += fuelSurchargeAmount;
      console.log('Step 6: Fuel Surcharge Amount (€):', fuelSurchargeAmount.toFixed(2));
      console.log('Step 6: Rate after Fuel Surcharge (€):', finalRateStandard.toFixed(2));
  }

  // Step 7: Add VAT (if applicable)
  if (config.vatPct > 0) {
      const vatAmount = finalRateStandard * (config.vatPct / 100);
      finalRateStandard += vatAmount;
      console.log('Step 7: VAT Amount (€):', vatAmount.toFixed(2));
      console.log('Step 7: Rate after VAT (€):', finalRateStandard.toFixed(2));
  }

  // Step 8: Calculate Dry Ice Cost (Requires more complex logic based on Fresh/Frozen categories and containers)
  // This step needs to be implemented fully based on your agreement (Step 3 & 11)
  let dryIceCost = 0;
  // This part would involve iterating through cartItems, checking categories,
  // selecting containers, and then calculating dry ice based on transitDays.
  // For now, let's just log the config values if they exist.
  if (config.dryIceCostPerKg > 0 && (config.freshIcePerDay > 0 || config.frozenIcePerDay > 0) && transitDays > 0) {
      console.log('Step 8: Dry Ice calculation details:');
      console.log(`  Dry Ice Cost Per Kg: ${config.dryIceCostPerKg}`);
      console.log(`  Dry Ice Volume Per Kg: ${config.dryIceVolumePerKg}`);
      console.log(`  Fresh Ice Per Day: ${config.freshIcePerDay}`);
      console.log(`  Frozen Ice Per Day: ${config.frozenIcePerDay}`);
      console.log(`  Transit Days: ${transitDays}`);
      // Actual dry ice cost calculation would go here based on item categories and container selection
      // For a basic example, let's assume a simple fixed dry ice need for demonstration
      // This part needs to be fully developed based on the container selection logic.
      // dryIceCost = (some_calculated_dry_ice_kg * config.dryIceCostPerKg) * (1 + config.vatPct / 100); // Assuming VAT applies to dry ice cost
      // console.log('  Calculated Dry Ice Cost (preliminary):', dryIceCost.toFixed(2));
  }
  // Add dryIceCost to finalRateStandard if calculated
  finalRateStandard += dryIceCost;


  // Step 9: Wine Surcharge (Ambient category only)
  let wineSurchargeTotal = 0;
  const wineItems = cartItems.filter(item => item.category === 'ambient' && item.name.toLowerCase().includes('wine')); // Adjust condition for wine
  if (config.wineSurcharge > 0 && wineItems.length > 0) {
      const numWineBottles = wineItems.reduce((sum, item) => sum + item.quantity, 0);
      wineSurchargeTotal = config.wineSurcharge * numWineBottles;
      console.log('Step 9: Number of Wine Bottles:', numWineBottles);
      console.log('Step 9: Wine Surcharge Total (€):', wineSurchargeTotal.toFixed(2));
  }
  finalRateStandard += wineSurchargeTotal; // Add wine surcharge to final rate

  // Step 10: Container Cost (Requires container selection logic)
  let containerCost = 0;
  // This step needs to be fully implemented based on the container selection logic (Step 2 & 11)
  // For now, just a placeholder.
  // containerCost = some_calculated_container_cost;
  // console.log('Step 10: Container Cost (preliminary):', containerCost.toFixed(2));
  finalRateStandard += containerCost; // Add container cost to final rate


  console.log('Step 11: Final Standard Rate before Time Slots (€):', finalRateStandard.toFixed(2));

  const ratesToReturn = [];

  // 1. Standard Service
  ratesToReturn.push({
    name:        'TNT Standard',
    code:        'TNT_STANDARD',
    total:       finalRateStandard,
    currency:    'EUR',
    // description: `ShipW ${shipW} kg → [${bracket?.minWeightKg || 'N/A'}-${bracket?.maxWeightKg || 'N/A'}] @ ${zoneValue || 'N/A'}: €${baseRate.toFixed(2)}`
    description: ``

  });

  // 2. EXPRESS ENTRO LE 10:00 AM
  const surcharge10AM = 10; // Hardcoded surcharge value
  let express10AMRate = finalRateStandard + surcharge10AM;
  console.log(`Step 12: EXPRESS ENTRO LE 10:00 AM Surcharge (€): ${surcharge10AM.toFixed(2)}`);
  console.log(`Step 12: EXPRESS ENTRO LE 10:00 AM Total Rate (€): ${express10AMRate.toFixed(2)}`);

  ratesToReturn.push({
    name:        'TNT EXPRESS ENTRO LE 10:00 AM',
    code:        'TNT_EXPRESS_10AM',
    total:       express10AMRate,
    currency:    'EUR',
    description: `Express delivery by 10:00 AM. Base: €${finalRateStandard.toFixed(2)} + Surcharge: €${surcharge10AM.toFixed(2)}`
  });

  // 3. EXPRESS ENTRO LE 12:00 AM
  const surcharge12AM = 5; // Hardcoded surcharge value
  let express12AMRate = finalRateStandard + surcharge12AM;
  console.log(`Step 13: EXPRESS ENTRO LE 12:00 AM Surcharge (€): ${surcharge12AM.toFixed(2)}`);
  console.log(`Step 13: EXPRESS ENTRO LE 12:00 AM Total Rate (€): ${express12AMRate.toFixed(2)}`);

  ratesToReturn.push({
    name:        'TNT EXPRESS ENTRO LE 12:00 AM',
    code:        'TNT_EXPRESS_12AM',
    total:       express12AMRate,
    currency:    'EUR',
    description: `Express delivery by 12:00 AM. Base: €${finalRateStandard.toFixed(2)} + Surcharge: €${surcharge12AM.toFixed(2)}`
  });

  console.log('--- TNT Calculation End ---');
  console.log('Final Rates to Return:', JSON.stringify(ratesToReturn, null, 2));

  return ratesToReturn; // Return the array of rates
}
