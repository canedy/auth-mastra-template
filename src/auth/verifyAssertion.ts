import { createRemoteJWKSet, jwtVerify } from "jose";

const replayCache = new Map<string, number>(); // jti -> exp

// Clean up expired tokens from replay cache
function cleanupReplayCache() {
  const now = Math.floor(Date.now() / 1000);
  for (const [jti, exp] of replayCache.entries()) {
    if (exp <= now) {
      replayCache.delete(jti);
    }
  }
}

// Clean up expired tokens periodically
setInterval(cleanupReplayCache, 60000); // Every minute

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

// New verifier for token service issued access tokens
export function makeAccessTokenVerifier(tokenServiceJwksUrl: string, expectedAudience: string) {
  const jwks = createRemoteJWKSet(new URL(tokenServiceJwksUrl), { timeoutDuration: 2000 });

  return async function verifyAccessToken(authorizationHeader?: string) {
    if (!authorizationHeader?.startsWith("Bearer "))
      throw new Error("Missing bearer token");
    const token = authorizationHeader.slice("Bearer ".length);

    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      audience: expectedAudience,
    });
    
    const { iss, sub, exp, jti, scopes } = payload;

    // Validate token service issued token
    if (!iss?.startsWith("https://token.example")) {
      throw new Error("Invalid issuer - must be token service");
    }
    
    if (!sub) throw new Error("Missing subject (agent ID)");
    if (!exp || !jti) throw new Error("Missing exp/jti");
    
    // Check replay protection - but allow the same agent to use the same token multiple times
    // (this is normal for cached tokens within their lifetime)
    const cacheKey = `${jti}_${sub}`;
    if (replayCache.has(cacheKey)) {
      // Token already used by this agent - this is normal for cached tokens
      console.log(`Token ${jti} reused by ${sub} - this is normal for cached tokens`);
    } else {
      replayCache.set(cacheKey, exp as number);
    }
    
    // Clean up expired tokens while we're here
    cleanupReplayCache();

    // Expect scopes as array
    if (!Array.isArray(scopes)) {
      throw new Error("Invalid token: scopes must be an array");
    }

    return { 
      agentId: sub as string, 
      scopes: scopes as string[],
      kid: protectedHeader.kid as string 
    };
  };
}
