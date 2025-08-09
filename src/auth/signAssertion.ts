import { importJWK, SignJWT } from "jose";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

type Opts = {
  privateJwkPath: string; // e.g., secrets/<kid>.private.jwk.json or http://localhost:8787/.well-known/jwks.json
  audience: string; // the tool API base URL or identifier
  agentId?: string; // Optional agent ID, used when fetching from HTTP endpoint
};

export async function makeClientAssertion({ privateJwkPath, audience, agentId }: Opts) {
  let priv;
  let agent_id;
  
  // Check if privateJwkPath is a URL or file path
  if (privateJwkPath.startsWith('http://') || privateJwkPath.startsWith('https://')) {
    // Fetch JWK from HTTP endpoint
    const response = await fetch(privateJwkPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWK from ${privateJwkPath}: ${response.statusText}`);
    }
    const data = await response.json();
    
    // Handle JWKS format (JWK Set) - typically has a 'keys' array
    if (data.keys && Array.isArray(data.keys)) {
      priv = data.keys[0]; // Use the first key
    } else {
      priv = data;
    }
    
    // Use provided agentId or fallback to one in JWK
    agent_id = agentId || priv.agent_id;
  } else {
    // Read JWK from local file
    priv = JSON.parse(readFileSync(join(privateJwkPath), "utf8"));
    agent_id = priv.agent_id;
  }
  
  const { kid } = priv;
  if (!kid) throw new Error("Private JWK missing kid");
  if (!agent_id) throw new Error("Agent ID not provided and not found in JWK");

  const key = await importJWK(priv, "EdDSA");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setIssuer(agent_id)
    .setSubject(agent_id)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 60) // 60s lifetime
    .setJti(randomUUID())
    .sign(key);
}
