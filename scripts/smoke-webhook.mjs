// Webhook delivery smoke test. Not committed; throwaway after this run.
// Stands up a local HTTP listener on a high port, seeds a webhook_endpoint
// + webhook_delivery row pointing at it, waits for the worker to deliver,
// verifies the signature with the SDK's verifyWebhookSignature, and asserts
// the DB row reached 'delivered'.
//
// Run from repo root with the docker compose stack already up:
//   node scripts/smoke-webhook.mjs

import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { verifyWebhookSignature } from "../sdk/node/dist/index.js";

const PORT = 9876;
const HOST_FROM_DOCKER = "host.docker.internal";
const SECRET = "whsec_smoke_test_secret_0123456789abcdef";
const ENDPOINT_PUBLIC_ID = `wh_smoke_${Date.now()}`;
const DELIVERY_PUBLIC_ID = `whd_smoke_${Date.now()}`;

function psql(sql) {
  // `psql -c` parses a single statement; newlines from template literals
  // break shell quoting in JSON.stringify. Collapse to a single line.
  const flat = sql.replace(/\s+/g, " ").trim();
  return execSync(
    `docker compose exec -T db psql -U auth -d auth -t -A -c ${JSON.stringify(flat)}`,
    { encoding: "utf8" },
  ).trim();
}

function psqlMulti(sqls) {
  for (const sql of sqls) {
    psql(sql);
  }
}

async function captureOneRequest() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks = [];
      req.on("data", c => chunks.push(c));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        server.close();
        resolve({
          method: req.method,
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    server.on("error", reject);
    server.listen(PORT, "0.0.0.0", () => console.log(`receiver listening on :${PORT}`));
    setTimeout(() => {
      server.close();
      reject(new Error("receiver timed out after 8s"));
    }, 8000);
  });
}

function findAppId() {
  const id = psql(
    "select id from external_apps where status = 'active' order by id asc limit 1",
  );
  if (!id) {
    throw new Error("No active external_app in DB. Register one first.");
  }
  return Number(id);
}

function seed(appId) {
  psql(
    `insert into webhook_endpoints (public_id, external_app_id, url, event_types, secret)
     values ('${ENDPOINT_PUBLIC_ID}', ${appId},
             'http://${HOST_FROM_DOCKER}:${PORT}/hook',
             array['activation.approved'], '${SECRET}')`,
  );
  psql(
    `insert into webhook_deliveries (public_id, webhook_endpoint_id, event_type, payload, next_attempt_at)
     select '${DELIVERY_PUBLIC_ID}', id, 'activation.approved',
            '{"id":"act_smoke","status":"approved"}'::jsonb, now()
       from webhook_endpoints where public_id = '${ENDPOINT_PUBLIC_ID}'`,
  );
}

function cleanup() {
  try {
    psqlMulti([
      `delete from webhook_deliveries where public_id = '${DELIVERY_PUBLIC_ID}'`,
      `delete from webhook_endpoints where public_id = '${ENDPOINT_PUBLIC_ID}'`,
    ]);
    console.log("cleanup ok");
  } catch (err) {
    console.error("cleanup failed:", err.message);
  }
}

async function main() {
  console.log("[1/5] locating an active external_app...");
  const appId = findAppId();
  console.log(`  using external_apps.id = ${appId}`);

  console.log("[2/5] starting HTTP receiver...");
  const captured = captureOneRequest();

  console.log("[3/5] seeding webhook_endpoint + webhook_delivery...");
  seed(appId);

  console.log("[4/5] waiting for worker to deliver (max 8s)...");
  let req;
  try {
    req = await captured;
  } catch (err) {
    cleanup();
    throw err;
  }
  console.log(`  received ${req.method} with headers:`);
  console.log(`    x-bottleneck-event:     ${req.headers["x-bottleneck-event"]}`);
  console.log(`    x-bottleneck-delivery:  ${req.headers["x-bottleneck-delivery"]}`);
  console.log(`    x-bottleneck-timestamp: ${req.headers["x-bottleneck-timestamp"]}`);
  console.log(`    x-bottleneck-signature: ${req.headers["x-bottleneck-signature"]?.slice(0, 20)}...`);
  console.log(`  body: ${req.body}`);

  const sigOk = verifyWebhookSignature({
    secret: SECRET,
    timestamp: req.headers["x-bottleneck-timestamp"],
    body: req.body,
    signature: req.headers["x-bottleneck-signature"],
  });
  console.log(`  signature verifies: ${sigOk}`);

  await sleep(500);
  const finalStatus = psql(
    `select status, attempt_count, response_status
       from webhook_deliveries
      where public_id = '${DELIVERY_PUBLIC_ID}'`,
  );
  console.log(`[5/5] DB row final state: ${finalStatus}`);

  cleanup();

  const headerEventOk = req.headers["x-bottleneck-event"] === "activation.approved";
  const headerDeliveryOk = req.headers["x-bottleneck-delivery"] === DELIVERY_PUBLIC_ID;
  const dbDelivered = finalStatus.startsWith("delivered|");
  const bodyParsed = JSON.parse(req.body);
  const bodyShapeOk =
    bodyParsed.type === "activation.approved" &&
    bodyParsed.id === DELIVERY_PUBLIC_ID &&
    bodyParsed.data?.status === "approved";

  if (sigOk && headerEventOk && headerDeliveryOk && dbDelivered && bodyShapeOk) {
    console.log("\nSMOKE PASS");
    process.exit(0);
  }
  console.error("\nSMOKE FAIL", {
    sigOk,
    headerEventOk,
    headerDeliveryOk,
    dbDelivered,
    bodyShapeOk,
  });
  process.exit(1);
}

main().catch(err => {
  console.error("smoke threw:", err);
  cleanup();
  process.exit(1);
});
