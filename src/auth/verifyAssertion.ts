import { createRemoteJWKSet, jwtVerify } from "jose";

const replayCache = new Map<string, number>(); // jti -> exp

export function makeVerifier(jwksUrl: string, expectedAudience: string) {
  const jwks = createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 2000 });

  return async function verify(authorizationHeader?: string) {
    if (!authorizationHeader?.startsWith("Bearer "))
      throw new Error("Missing bearer token");
    const token = authorizationHeader.slice("Bearer ".length);

    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      audience: expectedAudience,
    });
    const { iss, sub, exp, jti } = payload;

    if (!iss || iss !== sub) throw new Error("Invalid iss/sub");
    if (!exp || !jti) throw new Error("Missing exp/jti");
    if (replayCache.has(jti)) throw new Error("Replay detected");
    replayCache.set(jti, exp);

    return { agentId: iss as string, kid: protectedHeader.kid as string };
  };
}
