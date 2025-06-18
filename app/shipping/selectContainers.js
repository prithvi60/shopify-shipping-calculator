// Pick optimal containers based on category volume
export function selectContainers(volumeByCategory, availableContainers) {
  const containerPlan = {};

  for (const [category, totalVolume] of Object.entries(volumeByCategory)) {
    let remaining = totalVolume;
    containerPlan[category] = [];

    // Sort smallest to largest
    const sorted = availableContainers.sort((a, b) => a.volume - b.volume);

    while (remaining > 0) {
      const box = sorted.find(c => c.volume >= remaining) || sorted[sorted.length - 1];
      containerPlan[category].push(box);
      remaining -= box.volume;
    }
  }

  return containerPlan;
}
