// scripts/cleanup-old-classes.mjs
//
// Deletes class_submission metaobjects once their class is more than
// RETENTION_DAYS in the past (using end_date if present, otherwise
// start_date — matching the same "active until" logic used on the
// storefront). Intended to run on a daily schedule via a Digital Ocean
// App Platform "Job" component (see deployment notes).
//
// Run manually with: npm run cleanup-old-classes

import "@shopify/shopify-app-react-router/adapters/node";
import prisma from "../app/db.server.js";
import shopify from "../app/shopify.server.js";

const RETENTION_DAYS = 30;
const METAOBJECT_TYPE = "class_submission";

function cutoffYMD(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function cleanupShop(shopDomain, cutoff) {
  console.log(`\nProcessing shop: ${shopDomain}`);

  const { admin } = await shopify.unauthenticated.admin(shopDomain);

  let after = null;
  let checked = 0;
  let deleted = 0;
  const failures = [];

  for (let page = 0; page < 40; page++) {
    const resp = await admin.graphql(
      `#graphql
      query OldClasses($after: String) {
        metaobjects(type: "${METAOBJECT_TYPE}", first: 50, after: $after) {
          edges {
            node {
              id
              fields { key value }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { variables: { after } },
    );
    const json = await resp.json();
    const edges = json?.data?.metaobjects?.edges || [];

    for (const edge of edges) {
      checked++;
      const f = {};
      for (const field of edge.node.fields) f[field.key] = field.value;

      const startDate = (f.start_date || "").toString().slice(0, 10);
      const endDate = (f.end_date || "").toString().slice(0, 10);
      const activeUntil = endDate || startDate;

      if (activeUntil && activeUntil < cutoff) {
        const delResp = await admin.graphql(
          `#graphql
          mutation DeleteOldClass($id: ID!) {
            metaobjectDelete(id: $id) {
              deletedId
              userErrors { field message }
            }
          }`,
          { variables: { id: edge.node.id } },
        );
        const delJson = await delResp.json();
        const userErrors = delJson?.data?.metaobjectDelete?.userErrors || [];

        if (userErrors.length) {
          failures.push({ id: edge.node.id, errors: userErrors });
        } else {
          deleted++;
        }
      }
    }

    const pageInfo = json?.data?.metaobjects?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    after = pageInfo.endCursor;
  }

  console.log(`  Checked: ${checked}  Deleted: ${deleted}  Failures: ${failures.length}`);
  if (failures.length) {
    console.error("  Failure details:", JSON.stringify(failures, null, 2));
  }

  return { shop: shopDomain, checked, deleted, failures: failures.length };
}

async function run() {
  const cutoff = cutoffYMD(RETENTION_DAYS);
  console.log(`Class cleanup starting. Deleting classes with an active-until date before ${cutoff} (${RETENTION_DAYS}-day retention).`);

  const sessions = await prisma.session.findMany({ where: { isOnline: false } });

  if (!sessions.length) {
    console.log("No offline sessions found in the database — nothing to clean up.");
    return;
  }

  const uniqueShops = [...new Set(sessions.map((s) => s.shop))];
  const results = [];

  for (const shopDomain of uniqueShops) {
    try {
      const result = await cleanupShop(shopDomain, cutoff);
      results.push(result);
    } catch (err) {
      console.error(`  Error processing ${shopDomain}:`, err?.message || err);
      results.push({ shop: shopDomain, error: String(err?.message || err) });
    }
  }

  console.log("\nCleanup complete.");
  console.log(JSON.stringify(results, null, 2));

  await prisma.$disconnect();
}

run().catch(async (err) => {
  console.error("Cleanup job failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
