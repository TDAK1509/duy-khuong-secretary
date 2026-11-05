export function describeProtectedResource(publicBaseUrl: string) {
  return {
    resource: `${publicBaseUrl}/mcp`,
    authorization_servers: [publicBaseUrl],
    bearer_methods_supported: ['header'],
    resource_name: 'Trợ lý',
  };
}
