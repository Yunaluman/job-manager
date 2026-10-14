import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  open,
  rename,
  writeFile,
  lstat,
} from "node:fs/promises";
import { join } from "node:path";
import {
  validateDailyBatch,
  validateDailyProvenance,
  matchDailyProposal,
  offerUrl,
} from "../shared/domain/daily-proposals.mjs";
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function initializeDailyInbox(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS daily_batches (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
  );
}
export function dailySnapshot(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE name='daily_batches'")
    .get()
    ? db
        .prepare("SELECT data FROM daily_batches ORDER BY id")
        .all()
        .map((row) => JSON.parse(row.data))
    : [];
}
export function validateDailyReceipts(receipts, offers = []) {
  if (
    !Array.isArray(receipts) ||
    receipts.length > 10000 ||
    new Set(receipts.map((r) => r?.id)).size !== receipts.length
  )
    throw Error("Réception quotidienne invalide.");
  for (const receipt of receipts) {
    validateDailyBatch(receipt.batch);
    if (
      Object.keys(receipt).some(
        (k) => !["id", "sha256", "receivedAt", "batch", "outcomes"].includes(k),
      ) ||
      receipt.id !== receipt.batch.id ||
      receipt.sha256 !== hash(receipt.batch) ||
      !Number.isFinite(Date.parse(receipt.receivedAt)) ||
      !Array.isArray(receipt.outcomes) ||
      receipt.outcomes.length !== receipt.batch.proposals.length ||
      new Set(receipt.outcomes.map((o) => o.proposalId)).size !==
        receipt.outcomes.length
    )
      throw Error("Reçu quotidien invalide.");
    for (const outcome of receipt.outcomes) {
      if (
        Object.keys(outcome).some(
          (k) =>
            ![
              "proposalId",
              "result",
              "candidates",
              "offerId",
              "resolvedAt",
            ].includes(k),
        ) ||
        !receipt.batch.proposals.some((p) => p.id === outcome.proposalId) ||
        !["created", "duplicate", "review", "linked", "dismissed"].includes(
          outcome.result,
        ) ||
        !Array.isArray(outcome.candidates) ||
        (outcome.result === "created" && !outcome.offerId) ||
        (outcome.result === "review" && !outcome.candidates.length) ||
        (["duplicate", "linked"].includes(outcome.result) &&
          outcome.candidates.length !== 1) ||
        (["linked", "dismissed"].includes(outcome.result) &&
          !outcome.resolvedAt) ||
        outcome.candidates.some(
          (c) =>
            typeof c !== "string" || !/^(offer|application):.{1,200}$/.test(c),
        ) ||
        (outcome.offerId !== undefined &&
          (typeof outcome.offerId !== "string" ||
            !outcome.offerId ||
            outcome.offerId.length > 200)) ||
        (outcome.resolvedAt !== undefined &&
          !Number.isFinite(Date.parse(outcome.resolvedAt)))
      )
        throw Error("Rapprochement quotidien invalide.");
    }
  }
  for (const offer of offers)
    if (offer.dailyProposal) {
      validateDailyProvenance(offer.dailyProposal);
      const receipt = receipts.find(
        (r) => r.id === offer.dailyProposal.batchId,
      );
      if (
        !receipt ||
        !receipt.outcomes.some(
          (o) =>
            o.result === "created" &&
            o.offerId === offer.id &&
            o.proposalId === offer.dailyProposal.proposal.id,
        ) ||
        receipt.receivedAt !== offer.dailyProposal.receivedAt ||
        !receipt.batch.proposals.some(
          (p) =>
            JSON.stringify(p) === JSON.stringify(offer.dailyProposal.proposal),
        )
      )
        throw Error("Provenance quotidienne absente.");
    }
}
export function restoreDailyInbox(db, receipts) {
  initializeDailyInbox(db);
  for (const r of receipts)
    db.prepare("INSERT INTO daily_batches VALUES (?,?)").run(
      r.id,
      JSON.stringify(r),
    );
}
const rows = (db, table) =>
  db
    .prepare(`SELECT data FROM ${table}`)
    .all()
    .map((row) => JSON.parse(row.data));
function createOffer(db, proposal, receipt) {
  if (db.prepare("SELECT COUNT(*) AS n FROM offers").get().n >= 10000)
    throw Error("Limite d’offres atteinte.");
  const offer = {
    id: randomUUID(),
    company: proposal.company,
    title: proposal.title,
    location: proposal.location,
    text: proposal.text,
    url: proposal.url,
    note: "",
    createdAt: receipt.receivedAt,
    updatedAt: receipt.receivedAt,
    decision: "pending",
    decisions: [],
    dailyProposal: {
      batchId: receipt.id,
      receivedAt: receipt.receivedAt,
      proposal,
    },
  };
  db.prepare("INSERT INTO offers VALUES (?,?)").run(
    offer.id,
    JSON.stringify(offer),
  );
  return offer;
}
export function importDailyBatch(db, writes, batch) {
  validateDailyBatch(batch);
  const sha256 = hash(batch),
    existing = dailySnapshot(db).find((r) => r.id === batch.id);
  if (existing) {
    if (existing.sha256 !== sha256)
      throw Error("Identifiant de lot réutilisé avec un contenu différent.");
    return { replayed: true, receipt: existing };
  }
  if (dailySnapshot(db).length >= 10000)
    throw Error("Limite de lots atteinte.");
  return writes.commit(
    {
      operation: randomUUID(),
      expectedRevision: writes.revision(),
      method: "POST",
      path: "/internal/daily-inbox",
      body: batch,
    },
    () => {
      const receipt = {
        id: batch.id,
        sha256,
        receivedAt: new Date().toISOString(),
        batch,
        outcomes: [],
      };
      for (const proposal of batch.proposals) {
        const match = matchDailyProposal(
          proposal,
          rows(db, "offers"),
          rows(db, "applications"),
        );
        const outcome = { proposalId: proposal.id, ...match };
        if (match.result === "created")
          outcome.offerId = createOffer(db, proposal, receipt).id;
        receipt.outcomes.push(outcome);
      }
      db.prepare("INSERT INTO daily_batches VALUES (?,?)").run(
        receipt.id,
        JSON.stringify(receipt),
      );
      return { replayed: false, receipt };
    },
  ).result;
}
export function registerDailyRoutes(app, db, confirmWrite) {
  app.get("/api/daily-inbox", (_req, res) => res.json(dailySnapshot(db)));
  app.post("/api/daily-inbox/:id/resolve", (req, res) =>
    confirmWrite(req, res, () => {
      const receipt = dailySnapshot(db).find((r) => r.id === req.params.id),
        body = req.body;
      if (
        !receipt ||
        !body ||
        Object.keys(body).some((k) => !["proposalId", "choice"].includes(k)) ||
        typeof body.choice !== "string"
      )
        throw Object.assign(Error("Rapprochement invalide."), { status: 400 });
      const outcome = receipt.outcomes.find(
        (o) => o.proposalId === body.proposalId && o.result === "review",
      );
      if (!outcome)
        throw Object.assign(Error("Proposition déjà traitée ou absente."), {
          status: 400,
        });
      if (body.choice === "create") {
        outcome.offerId = createOffer(
          db,
          receipt.batch.proposals.find((p) => p.id === body.proposalId),
          receipt,
        ).id;
        outcome.result = "created";
      } else if (body.choice === "dismiss") outcome.result = "dismissed";
      else if (outcome.candidates.includes(body.choice)) {
        const [kind, id] = [
          body.choice.slice(0, body.choice.indexOf(":")),
          body.choice.slice(body.choice.indexOf(":") + 1),
        ];
        if (
          !db
            .prepare(
              `SELECT id FROM ${kind === "offer" ? "offers" : "applications"} WHERE id=?`,
            )
            .get(id)
        )
          throw Object.assign(Error("Dossier de rapprochement supprimé."), {
            status: 400,
          });
        outcome.result = "linked";
        outcome.candidates = [body.choice];
      } else
        throw Object.assign(Error("Choisis un rapprochement proposé."), {
          status: 400,
        });
      outcome.resolvedAt = new Date().toISOString();
      db.prepare("UPDATE daily_batches SET data=? WHERE id=?").run(
        JSON.stringify(receipt),
        receipt.id,
      );
      return { dailyInbox: dailySnapshot(db), offers: rows(db, "offers") };
    }),
  );
}
export function dailyIndex(db) {
  return {
    format: "jobpilot-known-offers",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: [
      ...rows(db, "offers").map((p) => ({
        kind: "offer",
        id: p.id,
        company: p.company,
        title: p.title,
        url: p.url,
        decision: p.decision,
      })),
      ...rows(db, "applications").map((p) => ({
        kind: "application",
        id: p.id,
        externalId: p.externalId ?? null,
        company: p.company,
        title: p.title,
        url: p.url ?? "",
        status: p.status,
      })),
    ].map((p) => ({ ...p, normalizedUrl: offerUrl(p.url) })),
  };
}
export function createDailyInboxWorker({
  db,
  writes,
  dataDirectory,
  intervalMs = 30000,
}) {
  const root = join(dataDirectory, "daily-inbox"),
    pending = join(root, "pending"),
    accepted = join(root, "accepted"),
    rejected = join(root, "rejected");
  const status = { checkedAt: null, error: null };
  let timer,
    working,
    stopped = false;
  async function scan() {
    if (stopped) return;
    if (working) return working;
    working = (async () => {
      for (const dir of [pending, accepted, rejected])
        await mkdir(dir, { recursive: true });
      for (const name of (await readdir(pending))
        .filter((n) => /^[a-zA-Z0-9_-]{1,120}\.json$/.test(n))
        .sort()
        .slice(0, 100)) {
        const path = join(pending, name);
        let handle;
        try {
          const metadata = await lstat(path);
          if (!metadata.isFile() || metadata.isSymbolicLink()) continue;
          handle = await open(path, "r");
          if ((await handle.stat()).size > 2 * 1024 * 1024)
            throw Error("Lot supérieur à 2 Mio.");
          const limit = 2 * 1024 * 1024,
            buffer = Buffer.alloc(limit + 1);
          let length = 0;
          while (length < buffer.length) {
            const { bytesRead } = await handle.read(
              buffer,
              length,
              buffer.length - length,
              null,
            );
            if (!bytesRead) break;
            length += bytesRead;
          }
          if (length > limit) throw Error("Lot supérieur à 2 Mio.");
          const text = buffer.subarray(0, length).toString("utf8");
          await handle.close();
          handle = undefined;
          importDailyBatch(db, writes, JSON.parse(text));
          await rename(path, join(accepted, `${randomUUID()}-${name}`));
        } catch (error) {
          await handle?.close();
          const destination = join(rejected, `${randomUUID()}-${name}`);
          // Retain the rejected bytes; diagnostics never contain document text.
          await rename(path, destination);
          await writeFile(
            destination + ".error.json",
            JSON.stringify({
              at: new Date().toISOString(),
              error:
                error instanceof SyntaxError
                  ? "JSON invalide."
                  : error.message ===
                      "Identifiant de lot réutilisé avec un contenu différent."
                    ? error.message
                    : "Lot invalide ou import non confirmé : vérifier le contrat et les limites.",
            }),
          );
        }
      }
      const temporary = join(root, "known-offers.json.tmp");
      await writeFile(temporary, JSON.stringify(dailyIndex(db), null, 2));
      await rename(temporary, join(root, "known-offers.json"));
      status.checkedAt = new Date().toISOString();
      status.error = null;
    })()
      .catch((error) => {
        status.error =
          "Réception des propositions indisponible. Les dossiers restent accessibles.";
        throw error;
      })
      .finally(() => {
        working = undefined;
      });
    return working;
  }
  return {
    scan,
    status: () => ({ ...status }),
    async start() {
      await scan().catch(() => {});
      timer = setInterval(() => void scan().catch(() => {}), intervalMs);
      timer.unref();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await working?.catch(() => {});
    },
  };
}
