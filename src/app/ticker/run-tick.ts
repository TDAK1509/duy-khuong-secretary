import { renewDueConnections, type RenewalDependencies } from '../channel-auth/renew-connections.ts';

export type TickDependencies = {
  renewal: RenewalDependencies | null;
};

export async function runTick(dependencies: TickDependencies): Promise<void> {
  if (dependencies.renewal) await renewDueConnections(dependencies.renewal);
}
