// Compute dry ice volume per container per category
export function computeDryIce(containerPlan, transitDays) {
  const dryIcePerDay = {
    fresh: 1,      // kg per day
    frozen: 2.5    // kg per day
  };

  const dryIcePlan = {};

  for (const [category, containers] of Object.entries(containerPlan)) {
    if (category === "ambient") continue;
    const kgPerContainer = dryIcePerDay[category] * transitDays;
    dryIcePlan[category] = containers.map(container => ({
      container,
      dryIceKg: kgPerContainer,
      dryIceVolume: kgPerContainer * 0.00068 // m³ per kg
    }));
  }

  return dryIcePlan;
}
