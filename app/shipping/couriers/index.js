// app/shipping/couriers/index.js
import * as FedexModule from './fedex.js';
import * as TntModule   from './tnt.js'
// import * as GlsModule   from './gls.js'
// …etc.

const courierModules = {
  FedEx: FedexModule,
  TNT:   TntModule,
  // GLS:   GlsModule,
  // …etc.
};

export function getCourierModule(name) {
  const mod = courierModules[name];
  if (!mod) throw new Error(`Unknown courier ${name}`);
  return mod;
}
